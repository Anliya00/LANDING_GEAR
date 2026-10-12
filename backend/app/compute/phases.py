"""Take-off, landing, touchdown and the roll windows.

Six of the nine D5 families need to know when the aircraft left the ground and
when it came back, so that work happens once per flight and is shared.

The requirements define these by search rather than by a single signal, and the
searches have a shape worth stating plainly:

  * a **take-off** is anchored on WOW_NOSE 1->0 (lift-off) and its roll window
    runs *backward* from there to the last moment the wheels were stationary;
  * a **landing** is anchored on the earliest of four candidate signals and its
    window runs *forward* to the first time wheel speed decays past 10 kt;
  * both de-duplicate by resolving candidates to a common point. Two candidates
    that resolve to the same point are the same physical event: the earliest is
    the anchor, the rest are stored with occurrence_seq = NULL.

That last rule is what stops a noisy WOW signal from inventing three landings.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.compute.models import FALLING, RISING, EventKey, Occurrence
from app.compute.signals import FlightSignals

# -- tunables ---------------------------------------------------------------
#: "first time wheel speed decays to <=10 kts (~5.14 m/s)". The Parquet column
#: carries M/S (the unit is in the file's metadata), so no conversion.
WHEEL_SPEED_DECAY_MS = 5.14
KNOTS_TO_MS = 0.514444
#: Max Nz is "the largest sample / 9.806, in g".
G = 9.806

#: How close to its peak the wheel speed must still be at lift-off for the roll
#: to count as "a continuous climb to lift-off". This is what separates a real
#: take-off from the nose-gear bouncing during a landing rollout: on a take-off
#: the aircraft is still accelerating when the nose comes up, so the speed at
#: the anchor is its maximum; on a bounce the speed peaked at touchdown and is
#: already decaying. Measured on real flights: genuine take-offs sit at 0.997
#: and 1.000 of peak, a rollout bounce at 0.915.
CLIMB_PEAK_RATIO = 0.95

#: A landing must spin the wheels up past this (m/s) to be a landing at all.
#: NOT IN THE REQUIREMENTS — added because low-speed taxi movement crosses the
#: 10 kt decay threshold and would otherwise be reported as extra landings.
#: Measured on real flights: genuine landings peak at 75-78 m/s, taxi blips at
#: 5-6 m/s, so anything in 10..50 separates them. Confirm the value with the
#: requirements author.
LANDING_MIN_PEAK_MS = 15.0
# ---------------------------------------------------------------------------

WOW_NOSE_LIFTOFF = EventKey("Data-1", "wow_nose", FALLING)
WOW_LH_TOUCH = EventKey("Data-1", "wow_lh", RISING)
WOW_RH_TOUCH = EventKey("Data-1", "wow_rh", RISING)
CHUTE_SELECT = EventKey("Data-2", "chute_select", RISING)

WHEEL_SPEED_COLUMNS = ["wheel_speed_lh", "wheel_speed_rh"]

#: Not literal 0/1 edges, but still events worth storing so a result can be
#: traced back to the moment it was measured from. They get EVENTS rows like
#: any other event — `seed_reference.py` reads them from the registry.
WHEEL_SPEED_LH_SPINUP = EventKey("Data-1", "wheel_speed_lh_from_zero", RISING)
WHEEL_SPEED_RH_SPINUP = EventKey("Data-1", "wheel_speed_rh_from_zero", RISING)
WHEEL_SPEED_ROLL_START = EventKey("Data-1", "wheel_speed_zero_before_climb", FALLING)
WHEEL_SPEED_DECAY = EventKey("Data-1", "wheel_speed_decay_10kt", FALLING)

DERIVED_EVENTS = frozenset(
    {WHEEL_SPEED_LH_SPINUP, WHEEL_SPEED_RH_SPINUP, WHEEL_SPEED_ROLL_START, WHEEL_SPEED_DECAY}
)

PHASE_EVENT_KEYS = frozenset(
    {WOW_NOSE_LIFTOFF, WOW_LH_TOUCH, WOW_RH_TOUCH, CHUTE_SELECT} | DERIVED_EVENTS
)
PHASE_SOURCE_FILES = frozenset({"Data-1", "Data-2"})


@dataclass
class TakeOff:
    """One validated take-off."""

    seq: int
    anchor: Occurrence          # WOW_NOSE 1->0, the lift-off moment
    roll_start: Occurrence | None   # last stationary wheel sample before the climb

    @property
    def roll_window(self) -> tuple[float, float] | None:
        if self.roll_start is None:
            return None
        return (self.roll_start.t, self.anchor.t)


@dataclass
class Landing:
    """One validated landing, and the roll inside it."""

    seq: int
    anchor: Occurrence              # earliest candidate: WOW or wheel spin-up
    decay: Occurrence               # first fall back through 10 kt
    touchdown: Occurrence | None = None   # wheel-speed-only anchor, for sink rate
    chute: Occurrence | None = None       # first CHUTE_SELECT 0->1 in the window

    @property
    def window(self) -> tuple[float, float]:
        return (self.anchor.t, self.decay.t)

    @property
    def roll_window(self) -> tuple[float, float] | None:
        """Landing roll: chute selection to the 10 kt point.

        None when no chute selection was found, which the requirements treat as
        "the landing roll is not defined".
        """
        if self.chute is None:
            return None
        return (self.chute.t, self.decay.t)


@dataclass
class FlightPhases:
    take_offs: list[TakeOff] = field(default_factory=list)
    landings: list[Landing] = field(default_factory=list)
    #: Detected but not selected — duplicates of a take-off or landing already
    #: counted. Stored with occurrence_seq = NULL for traceability.
    unselected: list[Occurrence] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def all_occurrences(self) -> list[Occurrence]:
        found: list[Occurrence] = list(self.unselected)
        for take_off in self.take_offs:
            found.append(take_off.anchor)
            if take_off.roll_start:
                found.append(take_off.roll_start)
        for landing in self.landings:
            found.extend(o for o in (landing.anchor, landing.decay, landing.touchdown, landing.chute) if o)
        return found


def identify(signals: FlightSignals) -> FlightPhases:
    """Find every take-off and landing in one flight."""
    phases = FlightPhases()
    _find_take_offs(signals, phases)
    _find_landings(signals, phases)
    return phases


# ---------------------------------------------------------------------------
# take-off
# ---------------------------------------------------------------------------

def _is_continuous_climb(signals: FlightSignals, roll_start: float, anchor: float) -> bool:
    """Was the aircraft still accelerating when the nose came up?

    The requirements describe the take-off roll as the wheel speed departing
    zero and "begin[ning] continuous rise" to lift-off. Tested as: the speed at
    the anchor is still at (or within CLIMB_PEAK_RATIO of) its maximum over the
    roll. A simple monotonicity test is too strict — real take-off traces dip
    by a metre per second here and there — while this holds cleanly.
    """
    peak = 0.0
    at_anchor = 0.0
    for column in WHEEL_SPEED_COLUMNS:
        times, values = signals.between("Data-1", column, roll_start, anchor)
        if not values:
            continue
        peak = max(peak, max(values))
        at_anchor = max(at_anchor, values[-1])
    if peak <= 0:
        return False
    return at_anchor >= peak * CLIMB_PEAK_RATIO


def _window_peak(signals: FlightSignals, start: float, end: float) -> float:
    fastest = 0.0
    for column in WHEEL_SPEED_COLUMNS:
        _, values = signals.between("Data-1", column, start, end)
        if values:
            fastest = max(fastest, max(values))
    return fastest


def _find_take_offs(signals: FlightSignals, phases: FlightPhases) -> None:
    """Every WOW_NOSE 1->0, de-duplicated by its backward wheel-speed point.

    From the requirements:
        If two different candidates resolve to the same backward point -> they
        represent the same take-off event; keep the first candidate as the
        valid anchor, mark the rest as duplicates (occurrence_seq = NULL, still
        stored).
    """
    candidates = signals.edges(WOW_NOSE_LIFTOFF)
    if not candidates:
        phases.warnings.append("no WOW_NOSE 1->0 found: no take-off in this flight")
        return

    seen_roll_starts: dict[float, int] = {}
    seq = 0

    for t, raw in candidates:
        anchor = Occurrence(WOW_NOSE_LIFTOFF, t, raw)
        found = signals.last_zero_before("Data-1", WHEEL_SPEED_COLUMNS, t)

        if found is None:
            # No stationary point before lift-off. Still a take-off, but its
            # roll window is undefined, so MAX_NZ_TAKEOFF_ROLL cannot compute.
            seq += 1
            phases.take_offs.append(TakeOff(seq, anchor.selected(seq), None))
            phases.warnings.append(
                f"take-off {seq} at t={t:.3f}s: no zero wheel-speed sample before it; "
                "take-off roll window undefined"
            )
            continue

        roll_t, roll_raw = found
        if not _is_continuous_climb(signals, roll_t, t):
            # The wheels were stationary before this, but the speed peaked and
            # was already falling by the time the nose came up. That is the
            # nose gear unloading during a landing rollout, not a take-off.
            phases.unselected.append(anchor)
            phases.warnings.append(
                f"WOW_NOSE 1->0 at t={t:.3f}s is not a take-off: wheel speed had already "
                "peaked and was decaying, so the roll is not a continuous climb"
            )
            continue

        if roll_t in seen_roll_starts:
            # Same physical take-off as an earlier candidate.
            phases.unselected.append(anchor)
            phases.warnings.append(
                f"WOW_NOSE 1->0 at t={t:.3f}s resolves to the same roll start as "
                f"take-off {seen_roll_starts[roll_t]}; stored with occur_seq NULL"
            )
            continue

        seq += 1
        seen_roll_starts[roll_t] = seq
        phases.take_offs.append(
            TakeOff(
                seq,
                anchor.selected(seq),
                Occurrence(WHEEL_SPEED_ROLL_START, roll_t, roll_raw, seq),
            )
        )


# ---------------------------------------------------------------------------
# landing
# ---------------------------------------------------------------------------

def _landing_candidates(
    signals: FlightSignals, start: float, end: float
) -> list[Occurrence]:
    """WOW 0->1 and wheel speed leaving zero, inside one take-off's region."""
    found: list[Occurrence] = []

    for key in (WOW_LH_TOUCH, WOW_RH_TOUCH):
        for t, raw in signals.edges(key):
            if start < t < end:
                found.append(Occurrence(key, t, raw))

    for column, key in (
        ("wheel_speed_lh", WHEEL_SPEED_LH_SPINUP),
        ("wheel_speed_rh", WHEEL_SPEED_RH_SPINUP),
    ):
        cursor = start
        while True:
            hit = signals.first_leaving_zero("Data-1", column, cursor, end)
            if hit is None:
                break
            found.append(Occurrence(key, hit[0], hit[1]))
            cursor = hit[0]

    return sorted(found, key=lambda o: o.t)


def _find_landings(signals: FlightSignals, phases: FlightPhases) -> None:
    """Landings, searched only inside the region following a take-off.

    From the requirements:
        Landing identification is only ever performed within a window following
        a validated take-off anchor. Any wheel-speed/WOW transition occurring
        before the first take-off anchor in a flight is not evaluated as a
        landing candidate, since landing without a preceding take-off is not
        physically valid.
    """
    if not phases.take_offs:
        return

    seq = 0
    for index, take_off in enumerate(phases.take_offs):
        region_start = take_off.anchor.t
        region_end = (
            phases.take_offs[index + 1].anchor.t
            if index + 1 < len(phases.take_offs)
            else float("inf")
        )

        candidates = _landing_candidates(signals, region_start, region_end)
        if not candidates:
            phases.warnings.append(
                f"take-off {take_off.seq}: no landing candidate before the next take-off"
            )
            continue

        # Group candidates by the point they resolve to. Same point, same landing.
        groups: dict[float, list[Occurrence]] = {}
        decay_raw: dict[float, str] = {}
        for candidate in candidates:
            found = signals.first_decay_below(
                "Data-1", WHEEL_SPEED_COLUMNS, WHEEL_SPEED_DECAY_MS,
                after=candidate.t, before=region_end,
            )
            if found is None:
                phases.unselected.append(candidate)
                continue
            decay_t, raw = found
            groups.setdefault(decay_t, []).append(candidate)
            decay_raw[decay_t] = raw

        for decay_t in sorted(groups):
            members = sorted(groups[decay_t], key=lambda o: o.t)
            anchor = members[0]

            peak = _window_peak(signals, anchor.t, decay_t)
            if peak < LANDING_MIN_PEAK_MS:
                # Wheels never span up to anything like a touchdown speed. This
                # is taxi movement crossing the 10 kt line, not a landing.
                phases.unselected.extend(members)
                phases.warnings.append(
                    f"wheel-speed event at t={anchor.t:.3f}s is not a landing: peak speed "
                    f"{peak:.1f} m/s is below LANDING_MIN_PEAK_MS={LANDING_MIN_PEAK_MS}"
                )
                continue

            seq += 1
            # Everything else in the group is the same landing seen twice.
            phases.unselected.extend(members[1:])

            landing = Landing(
                seq=seq,
                anchor=anchor.selected(seq),
                decay=Occurrence(WHEEL_SPEED_DECAY, decay_t, decay_raw[decay_t], seq),
            )
            _attach_touchdown(landing, members, seq)
            _attach_chute(signals, landing, seq, phases)
            phases.landings.append(landing)


def _attach_touchdown(landing: Landing, members: list[Occurrence], seq: int) -> None:
    """The earliest wheel-speed candidate in the group, for sink rate.

    The requirements are explicit that touchdown is detected separately from
    the landing anchor: the anchor may be a WOW transition, but sink rate is
    read at a wheel-speed spin-up.
    """
    wheel = [o for o in members if o.key in (WHEEL_SPEED_LH_SPINUP, WHEEL_SPEED_RH_SPINUP)]
    if wheel:
        landing.touchdown = wheel[0].selected(seq)


def _attach_chute(
    signals: FlightSignals, landing: Landing, seq: int, phases: FlightPhases
) -> None:
    """First CHUTE_SELECT 0->1 inside the landing window; later ones are NULL."""
    start, end = landing.window
    inside = [
        Occurrence(CHUTE_SELECT, t, raw)
        for t, raw in signals.edges(CHUTE_SELECT)
        if start <= t <= end
    ]
    if not inside:
        phases.warnings.append(
            f"landing {seq}: no CHUTE_SELECT 0->1 in the window; "
            "landing-roll parameters cannot be computed"
        )
        return
    landing.chute = inside[0].selected(seq)
    phases.unselected.extend(inside[1:])
