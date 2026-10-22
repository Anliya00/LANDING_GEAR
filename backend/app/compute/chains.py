"""The sequential-chain walker.

This is the one piece of logic every gear-cycle family shares, so it lives here
rather than inside `retraction.py`. The rule, from PoC_Requirements-D2:

    Other events (step events): Only the first occurrence after the previous
    step is considered. Once the chain moves to the next step, any repeated
    occurrence of the same event is ignored.

and, for a step that is never found:

    If door-open-limit is not reached, the sequence stops at Step 2. Steps 3-6
    are not searched for.

So a chain is walked strictly forward, each step's search starting where the
previous step landed, and it stops dead at the first miss.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.compute.models import EventKey, Occurrence
from app.compute.signals import FlightSignals


@dataclass(frozen=True)
class Window:
    """The half-open interval [start, end) a cycle is searched in."""

    start: float
    end: float

    @property
    def length(self) -> float:
        return self.end - self.start


def cycle_windows(anchors: list[float], cap_seconds: float) -> list[Window]:
    """One window per anchor: up to the next anchor, or the cap, whichever first.

    From the doc: "Window for that cycle = [this trigger's timestamp, next
    trigger's timestamp (or +45s cap, whichever is sooner)]".
    """
    windows: list[Window] = []
    for i, start in enumerate(anchors):
        following = anchors[i + 1] if i + 1 < len(anchors) else float("inf")
        windows.append(Window(start, min(following, start + cap_seconds)))
    return windows


def debounce(times: list[float], minimum_gap: float) -> tuple[list[float], list[float]]:
    """Drop anchors that follow their predecessor too closely.

    Returns (kept, dropped). The requirements say anchors are debounced but give
    no value, so the threshold is configuration, not a constant — see
    `retraction.ANCHOR_DEBOUNCE_S`.
    """
    kept: list[float] = []
    dropped: list[float] = []
    for t in times:
        if kept and (t - kept[-1]) < minimum_gap:
            dropped.append(t)
        else:
            kept.append(t)
    return kept, dropped


def first_in(
    edges: list[tuple[float, str]],
    after: float,
    before: float,
    *,
    inclusive: bool,
) -> tuple[float, str] | None:
    """First edge in (after, before), or [after, before) when inclusive.

    Inclusive means an edge may share the exact sample of the previous step (or,
    for step 1, the anchor sample). Which steps are inclusive is decided per
    family via `CycleSpec.inclusive_steps`; it is only safe where simultaneity
    is physically valid (e.g. door open-limit reached together with gear
    downlock release). Strict steps cannot consume the same sample twice.
    """
    for t, raw in edges:
        if (t >= after if inclusive else t > after) and t < before:
            return (t, raw)
    return None


def walk(
    signals: FlightSignals,
    chain: list[EventKey],
    window: Window,
    occurrence_seq: int,
    anchor: tuple[EventKey, float] | None = None,
    inclusive_steps: Sequence[bool] | None = None,
) -> list[Occurrence]:
    """Walk one chain inside one window.

    Returns the occurrences found, in step order. A list shorter than `chain`
    means the chain broke: `len(result)` is the index of the step that failed,
    which is what the caller reports as "stopped at step N".

    `inclusive_steps[i]` says whether step i may share the previous step's
    timestamp. Default: only step 0 (may coincide with the anchor sample).
    """
    if inclusive_steps is None:
        inclusive_steps = [i == 0 for i in range(len(chain))]
    if len(inclusive_steps) != len(chain):
        raise ValueError(
            f"inclusive_steps has {len(inclusive_steps)} entries, chain has {len(chain)}"
        )

    found: list[Occurrence] = []
    cursor = window.start

    for step_index, key in enumerate(chain):
        hit = first_in(
            signals.edges(key),
            after=cursor,
            before=window.end,
            inclusive=inclusive_steps[step_index],
        )
        if hit is None:
            break
        t, raw = hit
        found.append(
            Occurrence(key=key, t=t, source_time=raw, occurrence_seq=occurrence_seq, anchor=anchor)
        )
        cursor = t

    return found


def all_occurrences(
    signals: FlightSignals, keys: set[EventKey]
) -> dict[tuple[EventKey, float], Occurrence]:
    """Every detected transition for these events, across the whole flight.

    The requirements are explicit that traceability wants all of them:

        All detected event occurrences (not just those used in a valid chain)
        are stored in 'event_timestamps'.

    They all start with occurrence_seq = None. The family then overwrites the
    ones its chains actually selected.
    """
    found: dict[tuple[EventKey, float], Occurrence] = {}
    for key in keys:
        for t, raw in signals.edges(key):
            found[(key, t)] = Occurrence(key=key, t=t, source_time=raw, occurrence_seq=None)
    return found
