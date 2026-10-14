"""Take-off and landing mass (requirements 3.5.3).

    How to get initial fuel loaded?  It is the very first entry of REMN_FF.
    Take-off fuel = Initial fuel loaded - REMN_FF at Take-off
    Aircraft take-off mass = Initial mass - Take-off fuel (used)

REMN_FF is remaining fuel, so it falls as the flight burns: the difference
between the first reading and the reading at an event is the fuel used up to
that point, and the aircraft is lighter by exactly that.

This resolves the question the earlier PoC left open, where computing mass as
"initial mass - fuel remaining" made the landing mass come out heavier than
the take-off mass. The D5 wording is unambiguous: it is fuel *used*.

`Initial mass` comes from the aircraft record, not the telemetry, so it
arrives in the `FlightContext`. Without it the two mass parameters cannot be
computed, but the three fuel parameters still can.
"""

from __future__ import annotations

from app.compute.models import EventKey, FamilyOutput, FlightContext, ParamResult
from app.compute.phases import FlightPhases
from app.compute.signals import FlightSignals

FAMILY = "mass"

FUEL_FILE = "Data-3"
FUEL_COLUMN = "remn_ff"

#: How far the nearest fuel sample may be from the event before the reading
#: stops counting as a measurement of it.
#:
#: NOT IN THE REQUIREMENTS, which say only "the sample nearest to anchor_ts".
#: Taken literally that returns the last row of the file even when fuel
#: recording stopped long before the event — AC3's REMN_FF ends 403 s before
#: its landing, which would have produced a landing mass from stale data and
#: no indication that anything was wrong. Beyond this gap the result is
#: Incomplete with the reason recorded, rather than a number nobody measured.
#: The normal sample interval is 0.16 s, so 10 s is generous.
MAX_FUEL_GAP_S = 10.0

TAKEOFF_FUEL_USED = "TAKEOFF_FUEL_USED"
LANDING_FUEL_USED = "LANDING_FUEL_USED"
AC_TAKEOFF_MASS = "AC_TAKEOFF_MASS"
AC_LANDING_MASS = "AC_LANDING_MASS"

PARAM_NAMES = frozenset(
    {TAKEOFF_FUEL_USED, LANDING_FUEL_USED,
     AC_TAKEOFF_MASS, AC_LANDING_MASS}
)

#: Parameters that belong to a take-off anchor; the rest belong to a landing.
#: INITIAL_FUEL_LOADED is not a parameter: the first REMN_FF reading is stored on
#: FLIGHTS.INITIAL_FUEL_LOADED_KG, once per flight, by the results writer.
TAKEOFF_PARAMS = frozenset({TAKEOFF_FUEL_USED, AC_TAKEOFF_MASS})

PARAM_DEFINITIONS: dict[str, tuple[str, str]] = {
    TAKEOFF_FUEL_USED: ("kg", "Initial fuel loaded minus REMN_FF at lift-off"),
    LANDING_FUEL_USED: ("kg", "Initial fuel loaded minus REMN_FF at the landing anchor"),
    AC_TAKEOFF_MASS: ("kg", "Aircraft initial mass minus take-off fuel used"),
    AC_LANDING_MASS: ("kg", "Aircraft initial mass minus landing fuel used"),
}

#: The mass family reads a value rather than detecting an edge, so it declares
#: no events of its own — the take-off and landing anchors it measures at are
#: declared and stored by the phase layer.
EVENT_KEYS: frozenset[EventKey] = frozenset()
#: Whether this family needs the take-off/landing pass.
NEEDS_PHASES = True

SOURCE_FILES = frozenset({"Data-1", "Data-2", FUEL_FILE})


def compute(
    signals: FlightSignals, context: FlightContext, phases: FlightPhases
) -> FamilyOutput:
    out = FamilyOutput(family=FAMILY, event_keys=EVENT_KEYS, param_names=PARAM_NAMES)

    times, values, _ = signals.series(FUEL_FILE, FUEL_COLUMN)
    if not values:
        out.warnings.append(f"{FUEL_FILE}.{FUEL_COLUMN} is empty; no mass parameters")
        return out

    initial_fuel = values[0]
    initial_mass = context.initial_mass_kg
    if initial_mass is None:
        out.warnings.append(
            "aircraft initial mass is not set; fuel used is still computed but "
            "AC_TAKEOFF_MASS and AC_LANDING_MASS cannot be"
        )

    # One per flight, stored on the FLIGHTS row rather than as a result.
    out.initial_fuel_kg = initial_fuel

    for take_off in phases.take_offs:
        _mass_at(
            signals, out, take_off.anchor, take_off.seq, initial_fuel, initial_mass,
            TAKEOFF_FUEL_USED, AC_TAKEOFF_MASS,
        )

    for landing in phases.landings:
        _mass_at(
            signals, out, landing.anchor, landing.seq, initial_fuel, initial_mass,
            LANDING_FUEL_USED, AC_LANDING_MASS,
        )

    return out


def _mass_at(
    signals: FlightSignals,
    out: FamilyOutput,
    anchor,
    seq: int,
    initial_fuel: float,
    initial_mass: float | None,
    fuel_param: str,
    mass_param: str,
) -> None:
    """Fuel used and mass at one anchor.

    The fuel reading is taken at "the sample nearest to anchor_ts, earlier or
    later (earlier if equally close)" — a different file with its own sample
    rate, so an exact timestamp match is not expected.
    """
    found = signals.nearest(FUEL_FILE, FUEL_COLUMN, anchor.t)
    if found is None:
        out.results.append(ParamResult.incomplete(fuel_param, seq))
        out.results.append(ParamResult.incomplete(mass_param, seq))
        return

    at_t, remaining, _ = found
    gap = at_t - anchor.t
    if abs(gap) > MAX_FUEL_GAP_S:
        out.warnings.append(
            f"{fuel_param} occurrence {seq}: nearest fuel sample is {gap:+.1f}s from the "
            f"anchor, beyond MAX_FUEL_GAP_S={MAX_FUEL_GAP_S}. {FUEL_FILE} does not cover "
            "this event, so fuel and mass are left Incomplete rather than guessed."
        )
        out.results.append(ParamResult.incomplete(fuel_param, seq))
        out.results.append(ParamResult.incomplete(mass_param, seq))
        return

    fuel_used = initial_fuel - remaining
    out.results.append(ParamResult(fuel_param, fuel_used, seq, anchor, anchor, complete=True))

    if initial_mass is None:
        out.results.append(ParamResult.incomplete(mass_param, seq))
    else:
        out.results.append(
            ParamResult(mass_param, initial_mass - fuel_used, seq, anchor, anchor, complete=True)
        )
