"""FLIGHT_STATUS, from the analysis worker's side.

Written against the table as it already exists: one row per flight, a VARCHAR
STATUS updated in place, columns FLIGHT_STATUS_ID / FLIGHT_ID / STATUS /
REMARKS / DATE_TIME. Nothing here changes that shape, so ingestion is untouched.

The claim uses the same `FOR UPDATE ... SKIP LOCKED` pattern as
`services/worker.py`, for the same reason: a second worker that meets a locked
row passes over it rather than blocking on it or processing the flight twice.
"""

from __future__ import annotations

import logging
from typing import Any

import oracledb

from app.core import status as st
from app.db.pool import row_to_dict

log = logging.getLogger("db.analysis")


def get_flight(conn: oracledb.Connection, flight_id: int) -> dict[str, Any] | None:
    """Everything the compute job needs about one flight.

    INITIAL_MASS_KG is the per-flight override the requirements add to FLIGHTS;
    it falls back to the aircraft's registered mass when the column is absent or
    null, which is the usual case.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT f.FLIGHT_ID, f.AIRCRAFT_ID, a.AIRCRAFT_NUMBER, f.FLIGHT_NUMBER,
               f.FLIGHT_DATE_TIME, a.AIRCRAFT_MASS_KG,
               fs.FLIGHT_STATUS_ID, fs.STATUS
          FROM FLIGHTS f
          JOIN AIRCRAFTS a ON a.AIRCRAFT_ID = f.AIRCRAFT_ID
          LEFT JOIN FLIGHT_STATUS fs ON fs.FLIGHT_ID = f.FLIGHT_ID
         WHERE f.FLIGHT_ID = :f
        """,
        f=flight_id,
    )
    return row_to_dict(cur)


def initial_mass(conn: oracledb.Connection, flight_id: int) -> float | None:
    """Per-flight initial mass if FLIGHTS has it, else the aircraft's own."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT INITIAL_MASS_KG FROM FLIGHTS WHERE FLIGHT_ID = :f", f=flight_id
        )
        row = cur.fetchone()
        if row and row[0] is not None:
            return float(row[0])
    except oracledb.DatabaseError:
        # The column is optional — the requirements add it, the current schema
        # may not have it yet. Fall through to the aircraft's mass.
        pass

    flight = get_flight(conn, flight_id)
    mass = flight.get("aircraft_mass_kg") if flight else None
    return float(mass) if mass is not None else None


def set_status(
    conn: oracledb.Connection, flight_id: int, value: str, remarks: str | None = None
) -> None:
    """Move a flight to `value`. Does not commit — the caller owns the boundary."""
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE FLIGHT_STATUS
           SET STATUS = :s, REMARKS = :r, DATE_TIME = SYSTIMESTAMP
         WHERE FLIGHT_ID = :f
        """,
        s=value,
        r=(remarks or None) and remarks[: st.REMARKS_MAX],
        f=flight_id,
    )
    if cur.rowcount == 0:
        cur.execute("SELECT FLIGHT_STATUS_SEQ.NEXTVAL FROM DUAL")
        cur.execute(
            """
            INSERT INTO FLIGHT_STATUS (FLIGHT_STATUS_ID, FLIGHT_ID, STATUS, REMARKS, DATE_TIME)
            VALUES (FLIGHT_STATUS_SEQ.CURRVAL, :f, :s, :r, SYSTIMESTAMP)
            """,
            f=flight_id,
            s=value,
            r=(remarks or None) and remarks[: st.REMARKS_MAX],
        )

    # When analysis finishes (completed or failed), record the end time on FLIGHTS
    if value in (st.ANALYSIS_COMPLETE, st.ANALYSIS_FAILED):
        cur.execute(
            "UPDATE FLIGHTS SET INGESTION_END_TIME = SYSTIMESTAMP WHERE FLIGHT_ID = :f",
            f=flight_id,
        )


def queue_for_analysis(
    conn: oracledb.Connection, flight_id: int, remarks: str | None = None
) -> tuple[bool, str]:
    """Mark a flight ANALYSIS PENDING. Returns (queued, reason).

    This is the whole of "enqueue": there is no broker. Writing the status IS
    the enqueue, and the analysis worker's poll is the dequeue.
    """
    flight = get_flight(conn, flight_id)
    if flight is None:
        raise LookupError(f"no FLIGHTS row for flight_id={flight_id}")

    current = (flight.get("status") or "").strip().upper()
    if current in st.BUSY:
        return (False, f"flight is {st.label(current)}; wait for it to finish")
    if current and current not in st.READY_FOR_ANALYSIS:
        return (False, f"flight is {st.label(current)}; upload has not completed")

    set_status(conn, flight_id, st.ANALYSIS_PENDING, remarks)
    cur = conn.cursor()
    cur.execute(
        "UPDATE FLIGHTS SET INGESTION_END_TIME = NULL WHERE FLIGHT_ID = :f",
        f=flight_id,
    )
    return (True, st.ANALYSIS_PENDING)


def claim_next_pending(conn: oracledb.Connection, worker_id: str) -> dict[str, Any] | None:
    """Atomically take ownership of one flight awaiting analysis, or None.

    Mirrors the ingestion worker's claim so the two behave identically and can
    run side by side without either starving the other.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT fs.FLIGHT_ID
          FROM FLIGHT_STATUS fs
         WHERE fs.STATUS = :pending
           AND ROWNUM = 1
           FOR UPDATE OF fs.STATUS SKIP LOCKED
        """,
        pending=st.ANALYSIS_PENDING,
    )
    row = cur.fetchone()
    if row is None:
        conn.rollback()
        return None

    flight_id = int(row[0])
    set_status(conn, flight_id, st.ANALYZING, f"claimed by {worker_id}")
    flight = get_flight(conn, flight_id)
    conn.commit()  # releases the lock; the flight is now ours

    log.info("claimed flight_id=%s for analysis", flight_id)
    return flight


def requeue_stale(conn: oracledb.Connection, timeout_seconds: int) -> int:
    """Return flights a crashed worker left ANALYZING to ANALYSIS PENDING.

    Safe only because compute is idempotent: `results_repo.delete_family`
    clears the family's prior rows before inserting, so a half-finished flight
    is redone rather than duplicated.
    """
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE FLIGHT_STATUS
           SET STATUS = :pending, REMARKS = 'requeued: worker timed out',
               DATE_TIME = SYSTIMESTAMP
         WHERE STATUS = :analyzing
           AND DATE_TIME < SYSTIMESTAMP - NUMTODSINTERVAL(:secs, 'SECOND')
        """,
        pending=st.ANALYSIS_PENDING,
        analyzing=st.ANALYZING,
        secs=timeout_seconds,
    )
    count = cur.rowcount
    conn.commit()
    if count:
        log.warning("requeued %d stale analysis flight(s)", count)
    return count
