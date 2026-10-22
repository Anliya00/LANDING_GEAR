"""LG retraction cycle time (requirements 3.5.1).

Anchor: UC_LEVER_SEL_UP 0->1 in Data-1. Each anchor opens a cycle; inside that
cycle's window each of the three doors walks the six-step chain in Data-2,
independently of the other two.

    step 3  gear downlock release   <gear>_LOCKED_DOWN  1->0
    step 4  gear uplock             <gear>_LOCKED_UP    0->1

The other four steps and every completion rule are shared with extension —
see `_cycles.py`.
"""

from __future__ import annotations

from app.compute.families._cycles import FALLING, RISING, CycleSpec
from app.compute.families._cycles import compute as _compute
from app.compute.models import EventKey, FamilyOutput, FlightContext
from app.compute.phases import FlightPhases
from app.compute.signals import FlightSignals

FAMILY = "retraction"

# -- tunables ---------------------------------------------------------------
# The cap is the requirements' "+45s cap". The requirements say anchors are
# debounced but never give a value; 1.0 s is what the original PoC scripts used.
WINDOW_CAP_S = 45.0
ANCHOR_DEBOUNCE_S = 1.0
# ---------------------------------------------------------------------------

ANCHOR = EventKey("Data-1", "uc_lever_sel_up", RISING)
#: The extension anchor, so a lever-down closes a retraction window too.
EXTENSION_ANCHOR = EventKey("Data-1", "uc_lever_sel_dn", RISING)

#: Step order: 1 door unlock, 2 open limit reached, 3 gear downlock release,
#: 4 gear uplock, 5 door close (open limit leaves), 6 door lock.
#: Step 3 may coincide with step 2 and step 5 with step 4 (limit-switch signals);
#: steps 2, 4 and 6 stay strictly after their predecessor.
INCLUSIVE_STEPS = (True, False, True, False, True, False)

SPEC = CycleSpec(
    family=FAMILY,
    anchor=ANCHOR,
    gear_release=("locked_down", FALLING),   # step 3
    gear_lock=("locked_up", RISING),         # step 4
    total_param="TOTAL_RETRACTION_CYCLE_TIME",
    door_param="{door}_DOOR_RETRACTION_TIME",
    gear_param="{door}_GEAR_RETRACTION_TIME",
    window_cap_s=WINDOW_CAP_S,
    anchor_debounce_s=ANCHOR_DEBOUNCE_S,
    inclusive_steps=INCLUSIVE_STEPS,
)

EVENT_KEYS = SPEC.event_keys | {EXTENSION_ANCHOR}
PARAM_NAMES = SPEC.param_names
#: Whether this family needs the take-off/landing pass.
NEEDS_PHASES = False

SOURCE_FILES = SPEC.source_files

PARAM_DEFINITIONS: dict[str, tuple[str, str]] = {
    "TOTAL_RETRACTION_CYCLE_TIME": (
        "s", "Earliest door unlock to latest door lock across all three doors"
    ),
    "NOSE_DOOR_RETRACTION_TIME": ("s", "Nose door unlock to nose door lock"),
    "NOSE_GEAR_RETRACTION_TIME": ("s", "Nose gear downlock release to uplock"),
    "RH_DOOR_RETRACTION_TIME": ("s", "RH door unlock to RH door lock"),
    "RH_GEAR_RETRACTION_TIME": ("s", "RH MLG downlock release to uplock"),
    "LH_DOOR_RETRACTION_TIME": ("s", "LH door unlock to LH door lock"),
    "LH_GEAR_RETRACTION_TIME": ("s", "LH MLG downlock release to uplock"),
}


def compute(
    signals: FlightSignals, context: FlightContext, phases: FlightPhases
) -> FamilyOutput:
    return _compute(SPEC, signals, context, signals.edge_times(EXTENSION_ANCHOR))
