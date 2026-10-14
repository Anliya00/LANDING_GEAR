"""The shared engine behind the retraction and extension families.

Both are the same shape: an anchor signal opens a cycle, and inside that
cycle's window each of the three doors walks its own six-step chain. Only the
anchor and two of the six steps differ, so the logic lives here once and each
family is a `CycleSpec`.

The step meanings, from the requirements:

    1  door unlock          <door>_DOOR_LOCKED_UP   1->0   starts the door time
    2  door open limit      <door>_DOOR_OPEN_LIMIT  0->1   gate only
    3  gear release         (differs)                      starts the gear time
    4  gear lock            (differs)                      ends the gear time
    5  door close           <door>_DOOR_OPEN_LIMIT  1->0
    6  door lock            <door>_DOOR_LOCKED_UP   0->1   ends the door time

Step 2 is a condition, not a measurement: its timestamp is used by nothing, but
if the door never reaches its open limit the chain stops there and both of that
door's times are Incomplete.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.compute import chains
from app.compute.models import (
    EventKey,
    FamilyOutput,
    FlightContext,
    Occurrence,
    ParamResult,
)
from app.compute.signals import FlightSignals

STEP_COUNT = 6
DOOR_START, DOOR_END = 0, 5   # step 1 -> step 6
GEAR_START, GEAR_END = 2, 3   # step 3 -> step 4

DOORS = ("NOSE", "RH", "LH")

#: door -> (door signal stem, gear signal stem)
_SIGNALS: dict[str, tuple[str, str]] = {
    # The nose door's open-limit column is spelled differently from the mains'.
    "NOSE": ("nose_door_locked_up|nose_door_open_limit_reached", "ng"),
    "RH": ("rh_door_locked_up|rh_door_open_limit", "rh_mlg"),
    "LH": ("lh_door_locked_up|lh_door_open_limit", "lh_mlg"),
}

RISING, FALLING = 1, 0


@dataclass(frozen=True)
class CycleSpec:
    """Everything that distinguishes one cycle family from the other."""

    family: str
    anchor: EventKey
    #: step 3 and step 4 as (gear signal suffix, transition) pairs
    gear_release: tuple[str, int]
    gear_lock: tuple[str, int]
    total_param: str
    #: "DOOR" -> e.g. "NOSE_DOOR_RETRACTION_TIME"; "GEAR" likewise
    door_param: str
    gear_param: str
    window_cap_s: float
    anchor_debounce_s: float

    def chain(self, door: str) -> list[EventKey]:
        door_stem, gear_stem = _SIGNALS[door]
        locked_up, open_limit = door_stem.split("|")
        release_suffix, release_edge = self.gear_release
        lock_suffix, lock_edge = self.gear_lock
        return [
            EventKey("Data-2", locked_up, FALLING),
            EventKey("Data-2", open_limit, RISING),
            EventKey("Data-2", f"{gear_stem}_{release_suffix}", release_edge),
            EventKey("Data-2", f"{gear_stem}_{lock_suffix}", lock_edge),
            EventKey("Data-2", open_limit, FALLING),
            EventKey("Data-2", locked_up, RISING),
        ]

    @property
    def chains(self) -> dict[str, list[EventKey]]:
        return {door: self.chain(door) for door in DOORS}

    @property
    def event_keys(self) -> frozenset[EventKey]:
        return frozenset({self.anchor} | {k for c in self.chains.values() for k in c})

    @property
    def source_files(self) -> frozenset[str]:
        return frozenset(k.source_file for k in self.event_keys)

    def params(self) -> dict[str, tuple[str, int, int]]:
        """param name -> (door, start step index, end step index)."""
        found: dict[str, tuple[str, int, int]] = {}
        for door in DOORS:
            found[self.door_param.format(door=door)] = (door, DOOR_START, DOOR_END)
            found[self.gear_param.format(door=door)] = (door, GEAR_START, GEAR_END)
        return found

    @property
    def param_names(self) -> frozenset[str]:
        return frozenset(self.params()) | {self.total_param}


def compute(
    spec: CycleSpec,
    signals: FlightSignals,
    context: FlightContext,
    extra_anchors: list[float] | None = None,
) -> FamilyOutput:
    """Detect every cycle of one family. Pure — reads Parquet, touches no DB.

    `extra_anchors` are the other family's anchor times. The requirements say an
    extension cycle's window ends at "next trigger (any type)", so a retraction
    selection immediately afterwards closes it. The same union is applied to
    both families for consistency; in practice the 45 s cap almost always wins,
    because gear is raised after take-off and lowered before landing.
    """
    out = FamilyOutput(
        family=spec.family,
        event_keys=spec.event_keys,
        param_names=spec.param_names,
    )
    door_chains = spec.chains
    detected = chains.all_occurrences(signals, set(spec.event_keys))

    anchors, dropped = chains.debounce(
        signals.edge_times(spec.anchor), spec.anchor_debounce_s
    )
    for t in dropped:
        out.warnings.append(
            f"anchor at t={t:.3f}s debounced (<{spec.anchor_debounce_s}s gap)"
        )
    if not anchors:
        out.warnings.append(
            f"no {spec.anchor} found: no {spec.family} cycle in this flight"
        )
        out.occurrences = list(detected.values())
        return out

    boundaries = sorted(set(anchors) | set(extra_anchors or []))

    for cycle_no, start in enumerate(anchors, start=1):
        following = next((b for b in boundaries if b > start), float("inf"))
        window = chains.Window(start, min(following, start + spec.window_cap_s))

        anchor_occurrence = detected[(spec.anchor, start)].selected(cycle_no)
        detected[(spec.anchor, start)] = anchor_occurrence
        out.cycle_anchors[cycle_no] = anchor_occurrence.ident

        steps: dict[str, list[Occurrence]] = {}
        for door, chain in door_chains.items():
            walked = chains.walk(signals, chain, window, cycle_no, anchor_occurrence.ident)
            steps[door] = walked
            for occurrence in walked:
                detected[occurrence.ident] = occurrence
            if len(walked) < STEP_COUNT:
                out.warnings.append(
                    f"cycle {cycle_no} {door}: stopped at step {len(walked) + 1} "
                    f"({chain[len(walked)]})"
                )

        out.results.extend(_results_for_cycle(spec, cycle_no, steps))

    out.occurrences = list(detected.values())
    return out


def _results_for_cycle(
    spec: CycleSpec, cycle_no: int, steps: dict[str, list[Occurrence]]
) -> list[ParamResult]:
    results: list[ParamResult] = []

    for param_name, (door, start_index, end_index) in spec.params().items():
        walked = steps[door]
        if len(walked) == STEP_COUNT:
            start, end = walked[start_index], walked[end_index]
            results.append(
                ParamResult(param_name, end.t - start.t, cycle_no, start, end, complete=True)
            )
        else:
            # A broken chain on one door does not affect the other two.
            results.append(ParamResult.incomplete(param_name, cycle_no))

    # The total is Complete only when all three doors completed.
    done = [w for w in steps.values() if len(w) == STEP_COUNT]
    if len(done) == len(DOORS):
        earliest = min(done, key=lambda w: w[DOOR_START].t)[DOOR_START]
        latest = max(done, key=lambda w: w[DOOR_END].t)[DOOR_END]
        results.append(
            ParamResult(
                spec.total_param, latest.t - earliest.t, cycle_no, earliest, latest, complete=True
            )
        )
    else:
        results.append(ParamResult.incomplete(spec.total_param, cycle_no))

    return results
