"""EVENTS and PARAMETERS — the two master tables the compute layer reads.

Lookups are cheap and small (tens of rows), so they are read fresh per job
rather than cached in the process. A worker that runs for days then picks up a
newly seeded event without a restart.
"""

from __future__ import annotations

import logging

import oracledb

from app.compute.models import EventKey

log = logging.getLogger("db.reference")


def load_event_ids(conn: oracledb.Connection) -> dict[tuple[str, int], int]:
    """(column, transition) -> EVENT_ID.

    SOURCE_FILE is deliberately not part of the key. The same signal is never
    duplicated across files, and matching on two columns keeps the lookup
    working if a file is ever renamed. `check_event_sources` below still
    verifies the two agree.
    """
    cur = conn.cursor()
    cur.execute("SELECT event_id, event_column_name, transition FROM events")
    return {
        (column.strip().lower(), int(transition)): int(event_id)
        for event_id, column, transition in cur
    }


def load_event_sources(conn: oracledb.Connection) -> dict[tuple[str, int], str]:
    cur = conn.cursor()
    cur.execute("SELECT event_column_name, transition, source_file FROM events")
    return {
        (column.strip().lower(), int(transition)): (source or "").strip()
        for column, transition, source in cur
    }


def load_param_ids(conn: oracledb.Connection) -> dict[str, int]:
    cur = conn.cursor()
    cur.execute("SELECT param_id, param_name FROM parameters")
    return {name.strip().lower(): int(param_id) for param_id, name in cur}


def missing_reference(
    conn: oracledb.Connection,
    event_keys: set[EventKey],
    param_names: set[str],
) -> tuple[list[EventKey], list[str]]:
    """What the family needs that the database does not have.

    Called before any detection work, so a seeding mistake fails in a second
    with a readable list rather than after a full Parquet scan.
    """
    known_events = load_event_ids(conn)
    known_params = load_param_ids(conn)
    return (
        sorted(k for k in event_keys if k.lookup not in known_events),
        sorted(p for p in param_names if p.lower() not in known_params),
    )


def check_event_sources(conn: oracledb.Connection, event_keys: set[EventKey]) -> list[str]:
    """Warn where EVENTS.SOURCE_FILE disagrees with the family's own view.

    Not fatal — the compute side's `source_file` is what actually opens the
    Parquet — but a mismatch means one of the two is wrong and someone should
    look.
    """
    recorded = load_event_sources(conn)
    notes: list[str] = []
    for key in sorted(event_keys):
        declared = recorded.get(key.lookup)
        if declared and declared.lower() != key.source_file.lower():
            notes.append(
                f"{key}: EVENTS says source {declared!r}, family says {key.source_file!r}"
            )
    return notes


def upsert_event(
    conn: oracledb.Connection, event_id: int | None, key: EventKey
) -> None:
    """Idempotent insert of one EVENTS row.

    Deliberately a read then a write rather than a MERGE. Oracle infers bind
    datatypes inside `USING (SELECT :bind ... FROM dual)` and can decide a bind
    is VARCHAR2, which then fails comparing against the NUMBER column with
    ORA-01722. Two statements are slower and entirely predictable; this runs by
    hand a handful of times, so predictable wins.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT event_id FROM events
         WHERE LOWER(event_column_name) = :col
           AND transition = :tr
        """,
        col=key.column,
        tr=int(key.transition),
    )
    row = cur.fetchone()

    if row is not None:
        cur.execute(
            "UPDATE events SET event_name = :name, source_file = :sf WHERE event_id = :i",
            name=key.event_name,
            sf=key.source_file,
            i=int(row[0]),
        )
        return

    cur.execute(
        """
        INSERT INTO events (event_id, event_name, event_column_name, transition, source_file)
        VALUES (:i, :name, :col, :tr, :sf)
        """,
        i=int(event_id),
        name=key.event_name,
        col=key.column.upper(),
        tr=int(key.transition),
        sf=key.source_file,
    )
    log.info("created EVENTS row %s = %s", event_id, key)


def upsert_param(
    conn: oracledb.Connection,
    param_id: int | None,
    name: str,
    unit: str,
    description: str,
) -> None:
    """Idempotent insert of one PARAMETERS row.

    `unit` is the unit's NAME as the family declares it; it is resolved to a
    UNIT_ID here, creating the UNITS row if that unit has not been seen before.

    A read then a write, for the same reason as `upsert_event`.
    """
    unit_id = get_or_create_unit(conn, unit)
    cur = conn.cursor()
    cur.execute(
        "SELECT param_id FROM parameters WHERE LOWER(param_name) = :n", n=name.lower()
    )
    row = cur.fetchone()

    if row is not None:
        cur.execute(
            "UPDATE parameters SET unit_id = :u, description = :d WHERE param_id = :i",
            u=unit_id,
            d=description,
            i=int(row[0]),
        )
        return

    cur.execute(
        """
        INSERT INTO parameters (param_id, param_name, description, unit_id)
        VALUES (:i, :n, :d, :u)
        """,
        i=int(param_id),
        n=name,
        d=description,
        u=unit_id,
    )
    log.info("created PARAMETERS row %s = %s", param_id, name)
