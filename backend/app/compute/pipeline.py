"""One flight, end to end: resolve the data, run the families, persist.

This is the whole analysis job. It lives in `app/` rather than in the worker so
that the CLI and the worker reach the same code without importing each other.

The seam the design turns on is visible in `run_compute` below:

    compute_all(...)   takes a path, returns value objects, no connection
    results_repo.*     takes value objects, no Parquet

Each family is its own transaction. One family failing is recorded and does not
roll back the ones that already committed.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import oracledb

from app.compute import orchestrator, registry
from app.compute.models import FlightContext
from app.compute.signals import DataDefect
from app.config import get_settings
from app.db import analysis_repo, reference_repo, results_repo

log = logging.getLogger("compute.pipeline")


class FlightNotComputable(Exception):
    """The flight cannot be processed at all. Distinct from one family failing."""


def resolve_derived(flight: dict[str, Any]) -> Path:
    """Locate the flight's Derived folder.

    The layout the ingestion side writes, and the requirements describe, is
        <data_dir>/AC<n>/AC<n>_<NNN>_<ddmmyyyy>/Derived
    The flight number is matched as a three-digit prefix rather than an exact
    folder name, because the date segment is not in the database.
    """
    settings = get_settings()
    root = Path(settings.data_dir).resolve()

    aircraft_number = flight.get("aircraft_number")
    flight_number = flight.get("flight_number")
    if aircraft_number is None or flight_number is None:
        raise FlightNotComputable(
            f"flight_id={flight.get('flight_id')} has no aircraft or flight number"
        )

    aircraft = f"AC{aircraft_number}"
    prefix = f"{aircraft}_{int(flight_number):03d}_"

    # Both the flat layout on disk today and the Aircrafts/ layout the ingestion
    # code globs for, so this keeps working whichever way that is settled.
    for parent in (root / aircraft, root / "Aircrafts" / aircraft):
        if not parent.is_dir():
            continue
        for folder in sorted(parent.iterdir()):
            if folder.is_dir() and folder.name.startswith(prefix):
                derived = folder / "Derived"
                if derived.is_dir():
                    return derived
                raise FlightNotComputable(f"{folder} has no Derived subfolder")

    raise FlightNotComputable(
        f"no folder matching {prefix}* under {root / aircraft} "
        f"or {root / 'Aircrafts' / aircraft}"
    )


def run_compute(
    conn: oracledb.Connection,
    flight_id: int,
    *,
    families: list[str] | None = None,
    commit: bool = True,
) -> list[str]:
    """Run every configured family for one flight. Returns those that succeeded.

    Raises `FlightNotComputable` only when the flight itself cannot be processed
    — no row, no folder, a missing input file, a corrupt TIME column, or missing
    reference data. A single family failing is logged and skipped; the others'
    results stay committed and usable.

    `commit=False` leaves every insert in the open transaction so the caller can
    roll the lot back. That is how `scripts/run_compute --dry-run` exercises the
    real inserts without keeping them.
    """
    settings = get_settings()
    families = families or settings.compute_family_list

    flight = analysis_repo.get_flight(conn, flight_id)
    if flight is None:
        raise FlightNotComputable(f"no FLIGHTS row for flight_id={flight_id}")
    derived = resolve_derived(flight)

    # Fail fast on reference data: a seeding mistake should cost a second, not a
    # full Parquet scan.
    needed_events = registry.all_event_keys(families)
    missing_events, missing_params = reference_repo.missing_reference(
        conn, needed_events, set(registry.all_param_definitions(families))
    )
    if missing_events or missing_params:
        raise FlightNotComputable(
            "reference data missing — run scripts/seed_reference.py. "
            f"EVENTS: {[str(e) for e in missing_events]}; PARAMETERS: {missing_params}"
        )
    for note in reference_repo.check_event_sources(conn, needed_events):
        log.warning("%s", note)

    base_date = flight.get("flight_date_time")
    if base_date is None:
        raise FlightNotComputable(
            f"flight_id={flight_id} has no FLIGHT_DATE_TIME. The telemetry carries a "
            "clock but no date, so computed timestamps would have no day to sit on."
        )
    base_date = base_date.date() if hasattr(base_date, "date") else base_date

    context = FlightContext(
        flight_id=flight_id,
        initial_mass_kg=analysis_repo.initial_mass(conn, flight_id),
    )
    if context.initial_mass_kg is None:
        log.warning(
            "flight_id=%s has no aircraft mass; the two mass parameters will be "
            "Incomplete", flight_id,
        )

    log.info("flight_id=%s computing from %s", flight_id, derived)
    try:
        outputs = orchestrator.compute_all(derived, context, families)
    except DataDefect as exc:
        raise FlightNotComputable(str(exc)) from exc

    event_ids = reference_repo.load_event_ids(conn)
    param_ids = reference_repo.load_param_ids(conn)

    # One transaction for the whole run: families share events (retraction and
    # extension both read the door and lever signals), so they cannot be
    # replaced one at a time without one family clearing another's rows.
    try:
        results_repo.persist_all(
            conn, flight_id, base_date, outputs, event_ids, param_ids,
            link_mode=settings.results_link_mode,
        )
    except Exception:
        conn.rollback()
        log.exception("flight_id=%s failed to persist; nothing was written", flight_id)
        raise
    if commit:
        conn.commit()
    done = [o.family for o in outputs]
    for output in outputs:
        for note in output.warnings:
            log.info("flight_id=%s %s: %s", flight_id, output.family, note)

    if not done:
        raise FlightNotComputable(f"nothing persisted for flight_id={flight_id}")
    return done
