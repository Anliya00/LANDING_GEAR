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
    """Idempotent insert of one EVENTS row. Used by scripts/seed_reference.py."""
    cur = conn.cursor()
    cur.execute(
        """
        MERGE INTO events e
        USING (SELECT :col AS event_column_name, :tr AS transition FROM dual) src
           ON (LOWER(e.event_column_name) = src.event_column_name
               AND e.transition = src.transition)
        WHEN MATCHED THEN
          UPDATE SET e.event_name = :name, e.source_file = :src_file
        WHEN NOT MATCHED THEN
          INSERT (event_id, event_name, event_column_name, transition, source_file)
          VALUES (:eid, :name, :col_raw, :tr, :src_file)
        """,
        col=key.column,
        col_raw=key.column.upper(),
        tr=key.transition,
        name=key.event_name,
        src_file=key.source_file,
        eid=event_id,
    )


#: The families name units as the source files do; UNITS was populated with the
#: project's own spellings. These map one to the other so seeding reuses the
#: existing rows instead of creating near-duplicates beside them.
#:
#: 'milirad' is the spelling in the Parquet column metadata (one L). UNITS has
#: the correct 'millirad'.
UNIT_ALIASES: dict[str, str] = {
    "s": "sec",
    "milirad": "millirad",
    # "lsw": "m/s",   <- enable once the sink-rate unit is confirmed. UNITS
    #                    already holds 'm/s' and nothing else uses it, which
    #                    suggests it was added for exactly this.
}


def canonical_unit(unit_name: str) -> str:
    """The UNITS spelling for a unit a family declared."""
    key = (unit_name or "").strip().lower()
    return UNIT_ALIASES.get(key, key)


def load_unit_ids(conn: oracledb.Connection) -> dict[str, int]:
    """UNIT_NAME (lower-cased) -> UNIT_ID."""
    cur = conn.cursor()
    cur.execute("SELECT unit_id, unit_name FROM units")
    return {str(name).strip().lower(): int(uid) for uid, name in cur}


def get_or_create_unit(conn: oracledb.Connection, unit_name: str) -> int | None:
    """Resolve a unit name to its UNIT_ID, inserting the row if it is new.

    PARAMETERS carries UNIT_ID, not a unit string, so the unit each family
    declares has to be looked up here. Units are a tiny closed set ('s', 'kg',
    'm', 'g', 'knots'), so creating the missing ones on first seed is simpler
    than asking someone to pre-populate them by hand.
    """
    if not unit_name:
        return None

    wanted = canonical_unit(unit_name)
    known = load_unit_ids(conn)
    existing = known.get(wanted)
    if existing is not None:
        return existing

    # Local import: results_repo owns the sequence-or-MAX(id)+1 allocation.
    from app.db.results_repo import allocate

    cur = conn.cursor()
    new_id = allocate(cur, "units", "unit_id", "units_seq", 1)[0]
    cur.execute(
        "INSERT INTO units (unit_id, unit_name) VALUES (:i, :n)",
        i=new_id, n=wanted,
    )
    log.info("created UNITS row %s = %r", new_id, wanted)
    return new_id


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
    """
    unit_id = get_or_create_unit(conn, unit)
    cur = conn.cursor()
    cur.execute(
        """
        MERGE INTO parameters p
        USING (SELECT :name_lc AS param_name FROM dual) src
           ON (LOWER(p.param_name) = src.param_name)
        WHEN MATCHED THEN
          UPDATE SET p.unit_id = :unit_id, p.description = :descr
        WHEN NOT MATCHED THEN
          INSERT (param_id, param_name, description, unit_id)
          VALUES (:pid, :name, :descr, :unit_id)
        """,
        name=name,
        name_lc=name.lower(),
        unit_id=unit_id,
        descr=description,
        pid=param_id,
    )
