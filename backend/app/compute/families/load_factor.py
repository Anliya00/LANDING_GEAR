"""Max Nz during take-off and landing roll (requirements 3.5.6).

    Take-off roll window  = backward wheel-speed zero point -> WOW_NOSE 1->0
    Landing roll window   = first CHUTE_SELECT 0->1 -> first decay to 10 kt
    Max Nz = the largest sample / 9.806, in g

Both windows come from the phase layer. Take-off and landing are reported
separately, each carrying the occurrence_seq of the event it belongs to.
"""

from __future__ import annotations

from app.compute.models import EventKey, FamilyOutput, FlightContext, ParamResult
from app.compute.phases import G, FlightPhases
from app.compute.signals import FlightSignals

FAMILY = "load_factor"

SOURCE, COLUMN = "Data-6", "vertical_acceleration"

MAX_NZ_TAKEOFF = "MAX_NZ_TAKEOFF_ROLL"
MAX_NZ_LANDING = "MAX_NZ_LANDING_ROLL"

PARAM_NAMES = frozenset({MAX_NZ_TAKEOFF, MAX_NZ_LANDING})
EVENT_KEYS: frozenset[EventKey] = frozenset()
#: Whether this family needs the take-off/landing pass.
NEEDS_PHASES = True

SOURCE_FILES = frozenset({"Data-1", "Data-2", SOURCE})

PARAM_DEFINITIONS: dict[str, tuple[str, str]] = {
    MAX_NZ_TAKEOFF: ("g", "Peak vertical acceleration during the take-off roll"),
    MAX_NZ_LANDING: ("g", "Peak vertical acceleration during the landing roll"),
}


def compute(
    signals: FlightSignals, context: FlightContext, phases: FlightPhases
) -> FamilyOutput:
    out = FamilyOutput(family=FAMILY, event_keys=EVENT_KEYS, param_names=PARAM_NAMES)

    for take_off in phases.take_offs:
        window = take_off.roll_window
        if window is None:
            out.warnings.append(
                f"take-off {take_off.seq}: no roll window, so Max Nz cannot be computed"
            )
            out.results.append(ParamResult.incomplete(MAX_NZ_TAKEOFF, take_off.seq))
            continue
        _peak(
            signals, out, MAX_NZ_TAKEOFF, take_off.seq, window,
            take_off.roll_start, take_off.anchor,
        )

    for landing in phases.landings:
        window = landing.roll_window
        if window is None:
            out.warnings.append(
                f"landing {landing.seq}: no chute selection, so the landing roll is "
                "undefined and Max Nz cannot be computed"
            )
            out.results.append(ParamResult.incomplete(MAX_NZ_LANDING, landing.seq))
            continue
        _peak(
            signals, out, MAX_NZ_LANDING, landing.seq, window,
            landing.chute, landing.decay,
        )

    return out


def _peak(signals, out, param, seq, window, start_event, end_event) -> None:
    start, end = window
    _, values = signals.between(SOURCE, COLUMN, start, end)
    if not values:
        out.warnings.append(f"{param} occurrence {seq}: no {COLUMN} samples in the window")
        out.results.append(ParamResult.incomplete(param, seq))
        return
    out.results.append(
        ParamResult(param, max(values) / G, seq, start_event, end_event, complete=True)
    )
