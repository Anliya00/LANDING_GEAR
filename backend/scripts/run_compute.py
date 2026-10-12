"""Compute one flight from the command line. Replaces retraction_dryrun.py.

    python -m scripts.run_compute --flight-id 1 --dry-run     # prints, rolls back
    python -m scripts.run_compute --flight-id 1               # commits
    python -m scripts.run_compute --derived "E:/.../AC2/Derived" --detect-only

`--detect-only` needs no database at all: it reads the Parquet, walks the chains
and prints what WOULD be written. That is the old dry-run script's job, and it
is the fastest way to check a chain against a new flight.

`--dry-run` goes further: it does the real inserts and then rolls back, so it
also proves the reference data, the id allocation and the column types are right.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from app.compute import orchestrator, registry
from app.compute.models import transition_label
from app.config import get_settings
from app.core import status as st
from app.db import analysis_repo, reference_repo, results_repo
from app.compute.models import FlightContext
from app.compute.pipeline import resolve_derived, run_compute
from app.db.pool import close_pool, connection, init_pool


def detect_only(derived: Path, families: list[str], initial_mass: float | None) -> int:
    """No database. Read, detect, print."""
    run = orchestrator.open_flight(derived, families, FlightContext(initial_mass_kg=initial_mass))
    signals = run.signals

    for file_key in sorted(registry.all_source_files(families)):
        frame = signals.frame(file_key)
        print(
            f"{file_key}: {frame.height} rows, "
            f"{frame['t'][0]:.3f}..{frame['t'][-1]:.3f} s"
        )
    print()

    if run.phases_needed:
        print(f"phases: {run.summary()}")
        for take_off in run.phases.take_offs:
            print(f"  take-off {take_off.seq}: lift-off t={take_off.anchor.t:.3f}s"
                  + (f", roll {take_off.anchor.t - take_off.roll_start.t:.2f}s"
                     if take_off.roll_start else ", no roll window"))
        for landing in run.phases.landings:
            print(f"  landing {landing.seq}: anchor t={landing.anchor.t:.3f}s "
                  f"[{landing.anchor.key.column}], decay t={landing.decay.t:.3f}s"
                  + (f", chute t={landing.chute.t:.3f}s" if landing.chute else ", no chute"))
        for note in run.phases.warnings:
            print(f"  ! {note}")
        print()

    outputs = [run.phase_output()] if run.phases_needed else []
    for family in families:
        outputs.append(orchestrator.compute_family(family, run))

    for output in outputs:
        print("=" * 72)
        print(output.summary())
        for note in output.warnings:
            print(f"  ! {note}")
        for result in output.results:
            value = "NULL" if result.value is None else f"{result.value:14.4f}"
            print(
                f"  seq {result.occurrence_seq:>2}  {result.param_name:<32} "
                f"{value}  {result.status_text}"
            )
        selected = sum(1 for o in output.occurrences if o.occurrence_seq is not None)
        print(
            f"  event_timestamps: {len(output.occurrences)} row(s), "
            f"{selected} with occur_seq, {len(output.occurrences) - selected} NULL"
        )
    return 0


def against_database(flight_id: int, dry_run: bool) -> int:
    init_pool()
    try:
        with connection() as conn:
            flight = analysis_repo.get_flight(conn, flight_id)
            if flight is None:
                print(f"ABORT: no FLIGHTS row for flight_id={flight_id}", file=sys.stderr)
                return 2
            print(f"flight_id={flight_id}  aircraft={flight.get('aircraft_number')}  "
                  f"date={flight.get('flight_date_time')}")
            print(f"derived={resolve_derived(flight)}")

            families = run_compute(conn, flight_id, commit=not dry_run)
            print(f"families computed: {', '.join(families)}")

            if dry_run:
                conn.rollback()
                print("dry run — rolled back, nothing written")
                return 0

            analysis_repo.set_status(
                conn, flight_id, st.ANALYSIS_COMPLETE, f"families: {', '.join(families)}"
            )
        print("committed")
    finally:
        close_pool()
    return 0


def show_reference() -> int:
    """What the database holds, next to what the families need."""
    init_pool()
    try:
        with connection() as conn:
            events = reference_repo.load_event_ids(conn)
            params = reference_repo.load_param_ids(conn)
            missing_e, missing_p = reference_repo.missing_reference(
                conn, registry.all_event_keys(None), set(registry.all_param_definitions(None))
            )
        print(f"EVENTS: {len(events)} row(s)")
        for (column, transition), event_id in sorted(events.items()):
            print(f"  {event_id:>4}  {column:<34} {transition_label(transition)}")
        print(f"\nPARAMETERS: {len(params)} row(s)")
        for name, param_id in sorted(params.items()):
            print(f"  {param_id:>4}  {name}")
        if missing_e or missing_p:
            print("\nMISSING — run scripts/seed_reference.py")
            for key in missing_e:
                print(f"  EVENTS     {key}")
            for name in missing_p:
                print(f"  PARAMETERS {name}")
            return 1
        print("\nreference data complete")
    finally:
        close_pool()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flight-id", type=int)
    parser.add_argument("--derived", help="Derived folder, for --detect-only")
    parser.add_argument("--families", help="comma separated; default = every registered family")
    parser.add_argument("--detect-only", action="store_true", help="no database")
    parser.add_argument("--initial-mass", type=float, help="aircraft mass in kg, for --detect-only")
    parser.add_argument("--dry-run", action="store_true", help="insert, then roll back")
    parser.add_argument("--show-reference", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(name)s: %(message)s",
    )

    families = (
        [f.strip() for f in args.families.split(",")]
        if args.families
        else [f.strip() for f in get_settings().compute_families.split(",") if f.strip()]
    )

    if args.show_reference:
        return show_reference()
    if args.detect_only:
        if not args.derived:
            parser.error("--detect-only needs --derived")
        return detect_only(Path(args.derived), families, args.initial_mass)
    if args.flight_id is None:
        parser.error("give --flight-id, or --detect-only with --derived")
    return against_database(args.flight_id, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
