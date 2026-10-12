"""Writing EVENT_TIMESTAMPS and RESULTS. The persistence half of the seam.

Takes `FamilyOutput` and a connection. Never opens a Parquet file, never knows
what a door is.

Re-runnable by construction: `delete_family` clears exactly what a previous run
of the SAME family wrote, child rows first, and the caller does it inside the
same transaction as the inserts.
"""

from __future__ import annotations

import datetime as dt
import logging

import oracledb

from app.compute import timebase
from app.compute.models import EventKey, FamilyOutput, Occurrence

log = logging.getLogger("db.results")

ET_TABLE = "event_timestamps"
RS_TABLE = "results"

STATUS_COMPLETE = 1
STATUS_INCOMPLETE = 0

#: How RESULTS points at the two events a value was measured between.
#: "id"        -> START/END_EVENT_TIMESTAMP hold EVENT_TIMESTAMP_ID (the D2 spec)
#: "timestamp" -> they hold the datetimes themselves (what the PoC script wrote)
LinkMode = str


class ReferenceDataMissing(Exception):
    """An EVENTS or PARAMETERS master row the family needs does not exist."""


# ---------------------------------------------------------------------------
# id allocation
# ---------------------------------------------------------------------------

def _sequence_exists(cur: oracledb.Cursor, name: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) FROM user_sequences WHERE sequence_name = UPPER(:n)", n=name
    )
    return cur.fetchone()[0] > 0


def _next_ids(cur: oracledb.Cursor, sequence: str, count: int) -> list[int]:
    """Block-allocate ids. One round trip instead of one per row."""
    if count == 0:
        return []
    cur.execute(
        f"SELECT {sequence}.NEXTVAL FROM dual CONNECT BY LEVEL <= :n", n=count
    )
    return [int(r[0]) for r in cur]


def _max_plus_ids(cur: oracledb.Cursor, table: str, id_column: str, count: int) -> list[int]:
    """Fallback when the PK has neither a sequence nor an identity.

    SINGLE WRITER ONLY. Two workers running at once would allocate the same
    block and collide on the primary key. It is safe today only because the
    worker claims one flight at a time with FOR UPDATE SKIP LOCKED — create the
    sequences before you run a second worker.
    """
    if count == 0:
        return []
    cur.execute(f"SELECT NVL(MAX({id_column}), 0) FROM {table}")
    start = int(cur.fetchone()[0]) + 1
    return list(range(start, start + count))


def allocate(
    cur: oracledb.Cursor, table: str, id_column: str, sequence: str, count: int
) -> list[int]:
    if _sequence_exists(cur, sequence):
        return _next_ids(cur, sequence, count)
    log.warning("sequence %s not found; falling back to MAX(%s)+1", sequence, id_column)
    return _max_plus_ids(cur, table, id_column, count)


# ---------------------------------------------------------------------------
# delete (re-run safety)
# ---------------------------------------------------------------------------

def delete_family(
    conn: oracledb.Connection,
    flight_id: int,
    event_ids: list[int],
    param_ids: list[int],
) -> tuple[int, int]:
    """Remove this flight's rows for THIS family only. Children first.

    The PoC script did `DELETE FROM event_timestamps WHERE flight_id = :f`,
    which wiped every family's event rows, not just its own. Scoping the delete
    to the family's own EVENT_IDs is what lets two families coexist on one
    flight and still be independently re-runnable.

    Caveat worth knowing: if two families ever declare the SAME event, re-running
    one will delete the other's occurrence rows for that event. Nothing does
    today. If it ever happens, add a FAMILY column to EVENT_TIMESTAMPS rather
    than widening this delete.
    """
    cur = conn.cursor()

    results_deleted = 0
    if param_ids:
        binds = {f"p{i}": v for i, v in enumerate(param_ids)}
        placeholders = ",".join(f":{k}" for k in binds)
        cur.execute(
            f"DELETE FROM {RS_TABLE} WHERE flight_id = :f AND param_id IN ({placeholders})",
            {"f": flight_id, **binds},
        )
        results_deleted = cur.rowcount

    events_deleted = 0
    if event_ids:
        binds = {f"e{i}": v for i, v in enumerate(event_ids)}
        placeholders = ",".join(f":{k}" for k in binds)
        cur.execute(
            f"DELETE FROM {ET_TABLE} WHERE flight_id = :f AND event_id IN ({placeholders})",
            {"f": flight_id, **binds},
        )
        events_deleted = cur.rowcount

    log.info(
        "flight_id=%s deleted %d result(s), %d event occurrence(s)",
        flight_id, results_deleted, events_deleted,
    )
    return results_deleted, events_deleted


# ---------------------------------------------------------------------------
# insert
# ---------------------------------------------------------------------------

def insert_occurrences(
    conn: oracledb.Connection,
    flight_id: int,
    base_date: dt.date,
    occurrences: list[Occurrence],
    event_ids: dict[tuple[str, int], int],
    *,
    sequence: str = "event_timestamps_seq",
) -> dict[tuple[EventKey, float], int]:
    """Write EVENT_TIMESTAMPS, return each occurrence's new row id.

    Rows go in chronological order so EVENT_TIMESTAMP_ID reads in time order,
    which makes the table far easier to eyeball in SQL Developer.

    The returned map is what `insert_results` uses to fill START/END_EVENT_
    TIMESTAMP with real ids in "id" link mode.
    """
    cur = conn.cursor()
    ordered = sorted(occurrences, key=lambda o: (o.t, o.key.column, o.key.transition))
    ids = allocate(cur, ET_TABLE, "event_timestamp_id", sequence, len(ordered))

    rows: list[tuple] = []
    id_of: dict[tuple[EventKey, float], int] = {}
    for new_id, occurrence in zip(ids, ordered):
        try:
            event_id = event_ids[occurrence.key.lookup]
        except KeyError as exc:
            raise ReferenceDataMissing(
                f"EVENTS has no row for {occurrence.key}. Run scripts/seed_reference.py"
            ) from exc
        id_of[occurrence.ident] = new_id
        rows.append(
            (
                new_id,
                event_id,
                flight_id,
                timebase.to_datetime(base_date, occurrence.source_time, occurrence.t),
                occurrence.occurrence_seq,
            )
        )

    if rows:
        # Without this, oracledb binds a datetime as Oracle DATE, which has
        # second resolution, and the microseconds are silently truncated to 0.
        cur.setinputsizes(None, None, None, oracledb.DB_TYPE_TIMESTAMP, None)
        cur.executemany(
            f"INSERT INTO {ET_TABLE} "
            "(event_timestamp_id, event_id, flight_id, date_time, occur_seq) "
            "VALUES (:1, :2, :3, :4, :5)",
            rows,
        )
    log.info("flight_id=%s inserted %d event occurrence(s)", flight_id, len(rows))
    return id_of


def insert_results(
    conn: oracledb.Connection,
    flight_id: int,
    base_date: dt.date,
    output: FamilyOutput,
    param_ids: dict[str, int],
    timestamp_ids: dict[tuple[EventKey, float], int],
    *,
    link_mode: LinkMode = "id",
    sequence: str = "results_seq",
) -> int:
    """Write RESULTS.

    `link_mode="id"` follows the requirements doc, where RESULTS carries
    Start/End Event Timestamp *Id*. `link_mode="timestamp"` writes the datetimes
    instead, which is what the existing PoC tables hold. Set it in `.env` to
    match your DDL — getting it wrong is an ORA-00932 on the first insert, not
    silent corruption.
    """
    cur = conn.cursor()
    ids = allocate(cur, RS_TABLE, "result_id", sequence, len(output.results))

    def link(occurrence: Occurrence | None):
        if occurrence is None:
            return None
        if link_mode == "id":
            return timestamp_ids[occurrence.ident]
        return timebase.to_datetime(base_date, occurrence.source_time, occurrence.t)

    rows: list[tuple] = []
    for new_id, result in zip(ids, output.results):
        try:
            param_id = param_ids[result.param_name.lower()]
        except KeyError as exc:
            raise ReferenceDataMissing(
                f"PARAMETERS has no row for {result.param_name!r}. "
                "Run scripts/seed_reference.py"
            ) from exc
        rows.append(
            (
                new_id,
                flight_id,
                param_id,
                result.value,
                result.occurrence_seq,
                link(result.start),
                link(result.end),
                STATUS_COMPLETE if result.complete else STATUS_INCOMPLETE,
            )
        )

    if rows:
        if link_mode == "timestamp":
            cur.setinputsizes(
                None, None, None, None, None,
                oracledb.DB_TYPE_TIMESTAMP, oracledb.DB_TYPE_TIMESTAMP, None,
            )
        cur.executemany(
            f"INSERT INTO {RS_TABLE} "
            "(result_id, flight_id, param_id, param_val, occur_seq, "
            " start_event_timestamp, end_event_timestamp, status) "
            "VALUES (:1, :2, :3, :4, :5, :6, :7, :8)",
            rows,
        )
    log.info("flight_id=%s inserted %d result(s)", flight_id, len(rows))
    return len(rows)


# ---------------------------------------------------------------------------
# the whole of one family, in one transaction
# ---------------------------------------------------------------------------

def persist(
    conn: oracledb.Connection,
    flight_id: int,
    base_date: dt.date,
    output: FamilyOutput,
    event_ids: dict[tuple[str, int], int],
    param_ids: dict[str, int],
    *,
    link_mode: LinkMode = "id",
) -> tuple[int, int]:
    """Replace this family's rows for this flight. Does not commit.

    Delete first, then insert, so a re-run of the same family produces the same
    state as a first run. That is what lets the worker requeue a flight a
    crashed worker left half-done.

    Returns (occurrence rows, result rows).
    """
    delete_family(
        conn,
        flight_id,
        event_ids=[event_ids[k.lookup] for k in output.event_keys if k.lookup in event_ids],
        param_ids=[param_ids[p.lower()] for p in output.param_names if p.lower() in param_ids],
    )
    timestamp_ids = insert_occurrences(
        conn, flight_id, base_date, output.occurrences, event_ids
    )
    written = insert_results(
        conn, flight_id, base_date, output, param_ids, timestamp_ids, link_mode=link_mode
    )
    return (len(output.occurrences), written)
