"""The family registry.

Adding a parameter family is three steps and no edits anywhere else:

  1. write `families/<name>.py` exposing FAMILY, EVENT_KEYS, PARAM_NAMES,
     SOURCE_FILES, PARAM_DEFINITIONS and
     `compute(signals, context, phases) -> FamilyOutput`;
  2. add it to `_MODULES` below;
  3. re-run `python -m scripts.seed_reference` so its EVENTS and PARAMETERS
     master rows exist.

The orchestrator, the worker, the seeder and the CLI all read this registry, so
none of them changes.

Order matters only in that it is the order results are committed in; each
family is its own transaction.
"""

from __future__ import annotations

from types import ModuleType
from typing import Protocol

from app.compute import phases as phase_layer
from app.compute.families import (
    extension,
    landing_roll,
    load_factor,
    mass,
    retraction,
    sink_rate,
)
from app.compute.models import EventKey, FamilyOutput, FlightContext
from app.compute.signals import FlightSignals


class Family(Protocol):
    FAMILY: str
    EVENT_KEYS: frozenset[EventKey]
    PARAM_NAMES: frozenset[str]
    SOURCE_FILES: frozenset[str]
    PARAM_DEFINITIONS: dict[str, tuple[str, str]]

    def compute(
        self,
        signals: FlightSignals,
        context: FlightContext,
        phases: phase_layer.FlightPhases,
    ) -> FamilyOutput: ...


_MODULES: tuple[ModuleType, ...] = (
    retraction,
    extension,
    mass,
    sink_rate,
    landing_roll,
    load_factor,
)

FAMILIES: dict[str, ModuleType] = {m.FAMILY: m for m in _MODULES}

#: The phase layer's own events (take-off and landing anchors, the derived
#: wheel-speed points, chute selection). They belong to no single family, so
#: they are seeded and persisted under this name.
PHASE_FAMILY = "phases"


class UnknownFamily(KeyError):
    pass


def get(name: str) -> ModuleType:
    try:
        return FAMILIES[name]
    except KeyError as exc:
        raise UnknownFamily(
            f"unknown family {name!r}; registered: {', '.join(sorted(FAMILIES))}"
        ) from exc


def resolve(names: list[str] | None = None) -> list[ModuleType]:
    """Modules for the requested names, or every registered family."""
    if not names:
        return list(_MODULES)
    return [get(n.strip()) for n in names if n.strip()]


def all_event_keys(names: list[str] | None = None) -> set[EventKey]:
    """Every event the requested families need.

    The phase layer's own events join the set whenever a family that uses it is
    in the list, because the requirements want those occurrences stored
    whichever family consumes them.
    """
    keys: set[EventKey] = set()
    modules = resolve(names)
    if any(getattr(m, "NEEDS_PHASES", True) for m in modules):
        keys |= set(phase_layer.PHASE_EVENT_KEYS)
    for module in modules:
        keys |= set(module.EVENT_KEYS)
    return keys


def all_param_definitions(names: list[str] | None = None) -> dict[str, tuple[str, str]]:
    defined: dict[str, tuple[str, str]] = {}
    for module in resolve(names):
        defined.update(module.PARAM_DEFINITIONS)
    return defined


def all_source_files(names: list[str] | None = None) -> set[str]:
    """Input files the requested families need.

    The phase layer's own files are only required when a family that uses it is
    in the list — retraction and extension read Data-1 and Data-2 alone.
    """
    files: set[str] = set()
    modules = resolve(names)
    if any(getattr(m, "NEEDS_PHASES", True) for m in modules):
        files |= set(phase_layer.PHASE_SOURCE_FILES)
    for module in modules:
        files |= set(module.SOURCE_FILES)
    return files
