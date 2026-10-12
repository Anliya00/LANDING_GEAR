"""Touchdown sink rate (requirements 3.5.4).

    Sink rate = VER_LIN_VELOCITY from Data-6 at the sample nearest to the
    touchdown timestamp, earlier or later (earlier if equally close).

Touchdown is detected separately from the landing anchor: the anchor may be a
WOW transition, but the sink rate is read at the moment a wheel first spins up.
The phase layer has already resolved that — see `phases._attach_touchdown`.
"""

from __future__ import annotations

from app.compute.models import EventKey, FamilyOutput, FlightContext, ParamResult
from app.compute.phases import FlightPhases
from app.compute.signals import FlightSignals

FAMILY = "sink_rate"

SOURCE = "Data-6"
COLUMN = "ver_lin_velocity"

SINK_RATE = "SINK_RATE"

PARAM_NAMES = frozenset({SINK_RATE})
EVENT_KEYS: frozenset[EventKey] = frozenset()
#: Whether this family needs the take-off/landing pass.
NEEDS_PHASES = True

SOURCE_FILES = frozenset({"Data-1", "Data-2", SOURCE})

PARAM_DEFINITIONS: dict[str, tuple[str, str]] = {
    # The source column's unit metadata reads "LSW", which is not a velocity
    # unit. The value is carried through unconverted; confirm the unit with the
    # requirements author before anyone reads these numbers as ft/s or m/s.
    SINK_RATE: ("LSW", "Vertical linear velocity at touchdown, as recorded"),
}


def compute(
    signals: FlightSignals, context: FlightContext, phases: FlightPhases
) -> FamilyOutput:
    out = FamilyOutput(family=FAMILY, event_keys=EVENT_KEYS, param_names=PARAM_NAMES)

    for landing in phases.landings:
        if landing.touchdown is None:
            out.warnings.append(
                f"landing {landing.seq}: anchored on a WOW transition with no wheel-speed "
                "spin-up, so there is no touchdown point to read the sink rate at"
            )
            out.results.append(ParamResult.incomplete(SINK_RATE, landing.seq))
            continue

        found = signals.nearest(SOURCE, COLUMN, landing.touchdown.t)
        if found is None:
            out.results.append(ParamResult.incomplete(SINK_RATE, landing.seq))
            continue

        at_t, value, _ = found
        out.results.append(
            ParamResult(
                SINK_RATE, value, landing.seq,
                landing.touchdown, landing.touchdown, complete=True,
            )
        )
        if abs(at_t - landing.touchdown.t) > 0.1:
            out.warnings.append(
                f"landing {landing.seq}: nearest {COLUMN} sample is "
                f"{at_t - landing.touchdown.t:+.4f}s from touchdown"
            )

    return out
