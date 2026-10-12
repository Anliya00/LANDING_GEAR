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


_NUMERIC = ("NUMBER", "FLOAT", "INTEGER", "BINARY_FLOAT", "BINARY_DOUBLE")


def column_types(conn: oracledb.Connection, table: str) -> dict[str, str]:
    """Lower-cased column name -> Oracle data type, for one table."""
    cur = conn.cursor()
    cur.execute(
        "SELECT LOWER(column_name), data_type FROM user_tab_columns "
        "WHERE table_name = UPPER(:t)",
        t=table,
    )
    return {name: dtype for name, dtype in cur}


def _is_numeric(data_type: str | None) -> bool:
    return bool(data_type) and data_type.upper().startswith(_NUMERIC)


def _source_file_value(source_file: str, numeric: bool) -> object:
    """EVENTS.SOURCE_FILE as the column wants it.

    The families name the file 'Data-1'. A schema may store that string, or
    store just the 1. Inserting the string into a NUMBER column is ORA-01722,
    which is a confusing error to meet for the first time, so the type decides.
    """
    if not numeric:
        return source_file
    digits = "".join(c for c in str(source_file) if c.isdigit())
    if not digits:
        raise ValueError(
            f"EVENTS.SOURCE_FILE is numeric but {source_file!r} has no number in it"
        )
    return int(digits)


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


def _source_digits(value: object) -> str:
    """The file number inside a SOURCE_FILE value, however it is stored.

    1, '1' and 'Data-1' all come back as '1'. A value with no digits comes back
    lower-cased so two odd spellings can still be compared with each other.
    """
    text = "" if value is None else str(value).strip()
    digits = "".join(c for c in text if c.isdigit())
    return digits or text.lower()


def load_event_sources(conn: oracledb.Connection) -> dict[tuple[str, int], str]:
    """(column, transition) -> SOURCE_FILE as text; the column may be NUMBER or VARCHAR2."""
    cur = conn.cursor()
    cur.execute("SELECT event_column_name, transition, source_file FROM events")
    return {
        (str(column).strip().lower(), int(transition)): ("" if source is None else str(source).strip())
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
        if declared and _source_digits(declared) != _source_digits(key.source_file):
            notes.append(
                f"{key}: EVENTS says source {declared!r}, family says {key.source_file!r}"
            )
    return notes


# ---------------------------------------------------------------------------
# units
# ---------------------------------------------------------------------------

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
    declares has to be looked up here. Units are a tiny closed set, so creating
    the missing ones on first seed is simpler than asking someone to
    pre-populate them by hand.
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
        i=int(new_id), n=wanted,
    )
    log.info("created UNITS row %s = %r", new_id, wanted)
    return int(new_id)


# ---------------------------------------------------------------------------
# writes
# ---------------------------------------------------------------------------

def upsert_event(
    conn: oracledb.Connection, event_id: int | None, key: EventKey
) -> None:
    """Idempotent insert of one EVENTS row.

    Deliberately a read then a write rather than a MERGE: Oracle infers bind
    datatypes inside `USING (SELECT :bind ... FROM dual)` and can decide a bind
    is VARCHAR2, which then fails against a NUMBER column with ORA-01722.

    TRANSITION and SOURCE_FILE are bound to match the column types actually
    declared, because both are stored differently in different schemas — a
    transition as 1/0 or as '1'/'0', a source file as 'Data-1' or as 1.
    """
    types = column_types(conn, "events")
    transition_numeric = _is_numeric(types.get("transition"))
    source_numeric = _is_numeric(types.get("source_file"))

    transition = int(key.transition) if transition_numeric else str(key.transition)
    source_file = _source_file_value(key.source_file, source_numeric)

    cur = conn.cursor()
    cur.execute(
        """
        SELECT event_id FROM events
         WHERE LOWER(event_column_name) = :col
           AND transition = :tr
        """,
        col=key.column,
        tr=transition,
    )
    row = cur.fetchone()

    if row is not None:
        cur.execute(
            "UPDATE events SET event_name = :name, source_file = :sf WHERE event_id = :i",
            name=key.event_name,
            sf=source_file,
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
        tr=transition,
        sf=source_file,
    )
    log.info("created EVENTS row %s = %s (source %r)", event_id, key, source_file)


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
