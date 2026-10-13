"""Running families for one flight. Pure — takes a path, returns value objects.

This is the half of the seam that the analysis worker calls first. It takes no
database connection on purpose: every calculation in here can be unit-tested
against a synthetic Parquet folder with no Oracle anywhere in sight, and the
persistence half (`db/results_repo.py`) never sees a DataFrame.

The phase pass runs once per flight and is shared by every family, so a flight
is read, and its take-offs and landings resolved, exactly once however many
families are configured.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.compute import phases as phase_layer
from app.compute import registry
from app.compute.models import FamilyOutput, FlightContext
from app.compute.signals import DataDefect, FlightSignals

log = logging.getLogger("compute.orchestrator")


class FlightRun:
    """One flight, opened once: its signals, its phases, its context."""

    def __init__(
        self,
        derived: Path,
        context: FlightContext | None = None,
        families: list[str] | None = None,
    ) -> None:
        self.derived = Path(derived)
        self.context = context or FlightContext()
        self.families = families
        self.signals = FlightSignals(self.derived)
        self.signals.require_files(registry.all_source_files(families))
        self._phases: phase_layer.FlightPhases | None = None

    @property
    def phases(self) -> phase_layer.FlightPhases:
        """Take-offs and landings, resolved once and shared by every family.

        Lazy, because the cycle families do not need it. A flight whose Data-1
        lacks the WOW and wheel-speed columns can still have its retraction and
        extension cycles computed; only the six phase-dependent families fail.
        """
        if self._phases is None:
            self._phases = phase_layer.identify(self.signals)
            for note in self._phases.warnings:
                log.debug("phases: %s", note)
        return self._phases

    @property
    def phases_needed(self) -> bool:
        return any(
            getattr(m, "NEEDS_PHASES", True) for m in registry.resolve(self.families)
        )

    def phase_output(self) -> FamilyOutput:
        """The phase layer's own occurrences, as a family-shaped result.

        It produces no parameters — only the take-off, landing, touchdown and
        chute occurrences, which the requirements want stored so that every
        computed value can be traced back to the moment it was measured at.
        """
        return FamilyOutput(
            family=registry.PHASE_FAMILY,
            occurrences=self.phases.all_occurrences(),
            results=[],
            event_keys=phase_layer.PHASE_EVENT_KEYS,
            param_names=frozenset(),
            warnings=list(self.phases.warnings),
        )

    def summary(self) -> str:
        return (
            f"{len(self.phases.take_offs)} take-off(s), "
            f"{len(self.phases.landings)} landing(s)"
        )


def compute_family(family: str, run: FlightRun) -> FamilyOutput:
    """Run one family over an already-opened flight."""
    module = registry.get(family)
    run.signals.require_files(set(module.SOURCE_FILES))
    phases = run.phases if getattr(module, "NEEDS_PHASES", True) else phase_layer.FlightPhases()
    output = module.compute(run.signals, run.context, phases)
    log.info("%s", output.summary())
    for note in output.warnings:
        log.debug("  %s", note)
    return output


def compute_all(
    derived: Path,
    context: FlightContext | None = None,
    families: list[str] | None = None,
) -> list[FamilyOutput]:
    """Run several families over one shared read of the flight.

    A family that raises is logged and skipped; the others' output is still
    returned, so one broken calculation does not lose the rest. A `DataDefect`
    is different and propagates — it means the flight itself cannot be computed.

    The phase output comes first so its event rows exist before any family's
    results point at them.
    """
    modules = registry.resolve(families)
    run = FlightRun(derived, context, families)

    outputs: list[FamilyOutput] = []
    if run.phases_needed:
        outputs.append(run.phase_output())
    for module in modules:
        try:
            outputs.append(compute_family(module.FAMILY, run))
        except DataDefect:
            raise
        except Exception:
            log.exception("family %s failed", module.FAMILY)
    return outputs


def open_flight(
    derived: Path,
    families: list[str] | None = None,
    context: FlightContext | None = None,
) -> FlightRun:
    return FlightRun(derived, context, families)
