"""Value objects passed between the compute half and the persistence half.

Nothing here knows about Oracle, and nothing here knows about Parquet. That is
deliberate: `compute_family()` returns these, `results_repo` consumes them, and
neither imports the other.
"""

from __future__ import annotations

from dataclasses import dataclass, field

RISING = 1   # 0 -> 1
FALLING = 0  # 1 -> 0


def transition_label(transition: int) -> str:
    return "0->1" if transition == RISING else "1->0"


@dataclass(frozen=True, order=True)
class EventKey:
    """One row of the EVENTS master table, as the compute side sees it.

    `source_file` is how `signals.py` knows which Parquet to open. The database
    lookup matches on (column, transition) only — see `reference_repo` for why.

    A few events are not literal 0/1 edges: a wheel speed leaving zero, or
    decaying past 10 kt. Those use a synthetic column name (see
    `phases.DERIVED_EVENTS`) so they still get an EVENTS row and stay
    traceable, which is what the requirements ask for.
    """

    source_file: str   # "Data-1" ... "Data-6"
    column: str        # lower-case Parquet column, e.g. "uc_lever_sel_up"
    transition: int    # RISING or FALLING

    @property
    def lookup(self) -> tuple[str, int]:
        return (self.column, self.transition)

    @property
    def event_name(self) -> str:
        """Matches the EVENTS.EVENT_NAME convention in the requirements doc."""
        return f"{self.column.upper()} {transition_label(self.transition)}"

    def __str__(self) -> str:
        return f"{self.column} {transition_label(self.transition)}"


@dataclass(frozen=True)
class Occurrence:
    """One detected transition in one flight.

    `source_time` is the raw 'HH:MM:SS:ffffff' text straight out of the Parquet
    file. It is carried rather than recomputed so that the timestamp written to
    Oracle never passes through float arithmetic — the microseconds stored are
    byte-identical to the source.

    `occurrence_seq` is the cycle number this occurrence was selected into by
    the chain logic, or None if it was detected but not selected.
    """

    key: EventKey
    t: float            # seconds since midnight, midnight-rollover unwrapped
    source_time: str
    occurrence_seq: int | None = None

    @property
    def ident(self) -> tuple[EventKey, float]:
        """Identity used to de-duplicate and to look the row id up later."""
        return (self.key, self.t)

    def selected(self, seq: int) -> "Occurrence":
        """The same occurrence, promoted into cycle `seq`."""
        return Occurrence(self.key, self.t, self.source_time, seq)


@dataclass(frozen=True)
class ParamResult:
    """One row destined for RESULTS."""

    param_name: str
    value: float | None
    occurrence_seq: int
    start: Occurrence | None
    end: Occurrence | None
    complete: bool

    @property
    def status_text(self) -> str:
        return "Complete" if self.complete else "Incomplete"

    @staticmethod
    def incomplete(param_name: str, seq: int) -> "ParamResult":
        """A row recording that the value could not be computed for this cycle."""
        return ParamResult(param_name, None, seq, None, None, complete=False)


@dataclass(frozen=True)
class FlightContext:
    """Per-flight facts a family needs that are not in the Parquet.

    So far only the aircraft's initial mass, which the mass family subtracts
    fuel from. It is passed in rather than looked up, so the compute layer
    still takes no database connection.
    """

    flight_id: int | None = None
    initial_mass_kg: float | None = None


@dataclass
class FamilyOutput:
    """Everything one family produced for one flight.

    `event_keys` and `param_names` are the family's full declared footprint, not
    merely what was detected this time. They are what makes the re-run delete
    scoped correctly: a family that found nothing must still clear the rows a
    previous run of that same family left behind.
    """

    family: str
    occurrences: list[Occurrence] = field(default_factory=list)
    results: list[ParamResult] = field(default_factory=list)
    event_keys: frozenset[EventKey] = frozenset()
    param_names: frozenset[str] = frozenset()
    warnings: list[str] = field(default_factory=list)

    @property
    def cycle_count(self) -> int:
        return len({r.occurrence_seq for r in self.results})

    def summary(self) -> str:
        done = sum(1 for r in self.results if r.complete)
        return (
            f"{self.family}: {self.cycle_count} cycle(s), "
            f"{len(self.occurrences)} event occurrence(s), "
            f"{done}/{len(self.results)} result(s) complete"
        )
