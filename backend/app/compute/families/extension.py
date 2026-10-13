"""LG extension cycle time (requirements 3.5.2).

    Logic similar to 3.5.1.
    Anchor: LEVER_SEL_DN 0->1 (instead of UP)
    Window: next trigger (any type) or +45s cap

Only steps 3 and 4 differ from retraction — the gear comes out of its uplock
and into its downlock, the mirror of going up:

    step 3  gear uplock release   <gear>_LOCKED_UP    1->0
    step 4  gear downlock         <gear>_LOCKED_DOWN  0->1

Completion, status, occurrence_seq and NULL-seq duplicates are identical, so
they come from the shared engine in `_cycles.py`.
"""

from __future__ import annotations

from app.compute.families._cycles import FALLING, RISING, CycleSpec
from app.compute.families._cycles import compute as _compute
from app.compute.models import EventKey, FamilyOutput, FlightContext
from app.compute.phases import FlightPhases
from app.compute.signals import FlightSignals

FAMILY = "extension"

WINDOW_CAP_S = 45.0
ANCHOR_DEBOUNCE_S = 1.0

ANCHOR = EventKey("Data-1", "uc_lever_sel_dn", RISING)
#: The retraction anchor — "next trigger (any type)" closes the window.
RETRACTION_ANCHOR = EventKey("Data-1", "uc_lever_sel_up", RISING)

SPEC = CycleSpec(
    family=FAMILY,
    anchor=ANCHOR,
    gear_release=("locked_up", FALLING),     # step 3
    gear_lock=("locked_down", RISING),       # step 4
    total_param="TOTAL_EXTENSION_CYCLE_TIME",
    door_param="{door}_DOOR_EXTENSION_TIME",
    gear_param="{door}_GEAR_EXTENSION_TIME",
    window_cap_s=WINDOW_CAP_S,
    anchor_debounce_s=ANCHOR_DEBOUNCE_S,
)

EVENT_KEYS = SPEC.event_keys | {RETRACTION_ANCHOR}
PARAM_NAMES = SPEC.param_names
#: Whether this family needs the take-off/landing pass.
NEEDS_PHASES = False

SOURCE_FILES = SPEC.source_files

PARAM_DEFINITIONS: dict[str, tuple[str, str]] = {
    "TOTAL_EXTENSION_CYCLE_TIME": (
        "s", "Earliest door unlock to latest door lock across all three doors"
    ),
    "NOSE_DOOR_EXTENSION_TIME": ("s", "Nose door unlock to nose door lock"),
    "NOSE_GEAR_EXTENSION_TIME": ("s", "Nose gear uplock release to downlock"),
    "RH_DOOR_EXTENSION_TIME": ("s", "RH door unlock to RH door lock"),
    "RH_GEAR_EXTENSION_TIME": ("s", "RH MLG uplock release to downlock"),
    "LH_DOOR_EXTENSION_TIME": ("s", "LH door unlock to LH door lock"),
    "LH_GEAR_EXTENSION_TIME": ("s", "LH MLG uplock release to downlock"),
}


def compute(
    signals: FlightSignals, context: FlightContext, phases: FlightPhases
) -> FamilyOutput:
    return _compute(SPEC, signals, context, signals.edge_times(RETRACTION_ANCHOR))
