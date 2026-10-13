"""The landing roll: Nx, chute selection speed and roll distance.

Requirements 3.5.5, 3.5.7 and 3.5.8. All three measure over the same window —
first CHUTE_SELECT 0->1 inside the landing window, through to the first decay
to 10 kt — so they are one family rather than three.

    Max Nx = the sample with the largest magnitude, which is the most negative
             value, kept with its negative sign.
    Avg Nx = the simple average of the same samples, also negative.
    Chute selection speed = GROUND_SPEED at the sample nearest to the chute
             selection.
    Distance = sum over consecutive samples of (average of the two speeds) x
             (time gap), the trapezoidal rule, after converting knots to m/s.

If no chute selection is found the landing roll is not defined. The
requirements say Nx is then NULL with status INCOMPLETE, and that no distance
result is written at all.
"""

from __future__ import annotations

from app.compute.models import EventKey, FamilyOutput, FlightContext, ParamResult
from app.compute.phases import KNOTS_TO_MS, FlightPhases
from app.compute.signals import FlightSignals

FAMILY = "landing_roll"

NX_FILE, NX_COLUMN = "Data-4", "nx_data"
SPEED_FILE, SPEED_COLUMN = "Data-5", "ground_speed"

MAX_NX = "MAX_NX_LANDING_ROLL"
AVG_NX = "AVG_NX_LANDING_ROLL"
CHUTE_SPEED = "GROUND_SPEED_CHUTE_DEPLOYMENT"
ROLL_DISTANCE = "LANDING_ROLL_DISTANCE"

PARAM_NAMES = frozenset({MAX_NX, AVG_NX, CHUTE_SPEED, ROLL_DISTANCE})
EVENT_KEYS: frozenset[EventKey] = frozenset()
#: Whether this family needs the take-off/landing pass.
NEEDS_PHASES = True

SOURCE_FILES = frozenset({"Data-1", "Data-2", NX_FILE, SPEED_FILE})

PARAM_DEFINITIONS: dict[str, tuple[str, str]] = {
    # NX_DATA's unit metadata reads "MILIRAD", which is an angle, not an
    # acceleration. Carried through unconverted — confirm with the author.
    MAX_NX: ("MILIRAD", "Largest-magnitude NX_DATA sample during the landing roll"),
    AVG_NX: ("MILIRAD", "Mean NX_DATA over the landing roll"),
    CHUTE_SPEED: ("knots", "Ground speed at the moment the chute was selected"),
    ROLL_DISTANCE: ("m", "Distance covered from chute selection to 10 kt"),
}


def compute(
    signals: FlightSignals, context: FlightContext, phases: FlightPhases
) -> FamilyOutput:
    out = FamilyOutput(family=FAMILY, event_keys=EVENT_KEYS, param_names=PARAM_NAMES)

    for landing in phases.landings:
        seq = landing.seq
        window = landing.roll_window

        if window is None:
            # No chute selection: "both results are NULL with status INCOMPLETE",
            # and the distance is not written at all.
            out.warnings.append(
                f"landing {seq}: no chute selection, so the landing roll is undefined"
            )
            out.results.append(ParamResult.incomplete(MAX_NX, seq))
            out.results.append(ParamResult.incomplete(AVG_NX, seq))
            out.results.append(ParamResult.incomplete(CHUTE_SPEED, seq))
            continue

        start, end = window
        chute, decay = landing.chute, landing.decay

        _nx(signals, out, seq, start, end, chute, decay)
        _chute_speed(signals, out, seq, chute)
        _distance(signals, out, seq, start, end, chute, decay)

    return out


def _nx(signals, out, seq, start, end, chute, decay) -> None:
    _, values = signals.between(NX_FILE, NX_COLUMN, start, end)
    if not values:
        out.warnings.append(f"landing {seq}: no {NX_COLUMN} samples in the landing roll")
        out.results.append(ParamResult.incomplete(MAX_NX, seq))
        out.results.append(ParamResult.incomplete(AVG_NX, seq))
        return

    # "the sample with the largest magnitude, which is the most negative value,
    # kept with its negative sign" — so select on magnitude, report signed.
    peak = max(values, key=abs)
    mean = sum(values) / len(values)
    out.results.append(ParamResult(MAX_NX, peak, seq, chute, decay, complete=True))
    out.results.append(ParamResult(AVG_NX, mean, seq, chute, decay, complete=True))


def _chute_speed(signals, out, seq, chute) -> None:
    # The requirements say Data-1 here, but GROUND_SPEED only exists in Data-5
    # (confirmed against the real Parquet files), and 3.5.8 names Data-5 for the
    # same column. Reading Data-5.
    found = signals.nearest(SPEED_FILE, SPEED_COLUMN, chute.t)
    if found is None:
        out.results.append(ParamResult.incomplete(CHUTE_SPEED, seq))
        return
    _, value, _ = found
    out.results.append(ParamResult(CHUTE_SPEED, value, seq, chute, chute, complete=True))


def _distance(signals, out, seq, start, end, chute, decay) -> None:
    times, values = signals.between(SPEED_FILE, SPEED_COLUMN, start, end)
    if len(times) < 2:
        out.warnings.append(
            f"landing {seq}: fewer than two {SPEED_COLUMN} samples in the landing roll"
        )
        out.results.append(ParamResult.incomplete(ROLL_DISTANCE, seq))
        return

    metres = 0.0
    for i in range(1, len(times)):
        gap = times[i] - times[i - 1]
        mean_speed = (values[i] + values[i - 1]) / 2.0 * KNOTS_TO_MS
        metres += mean_speed * gap

    out.results.append(ParamResult(ROLL_DISTANCE, metres, seq, chute, decay, complete=True))
