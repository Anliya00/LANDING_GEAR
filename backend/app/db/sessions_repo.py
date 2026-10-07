"""Data access for SESSIONS."""

from __future__ import annotations

from typing import Any

import oracledb

from app.db.pool import row_to_dict


def create(
    conn: oracledb.Connection,
    session_hash: str,
    user_id: int,
    lifetime_hours: int,
    ip_address: str | None,
    user_agent: str | None,
) -> int:
    cur = conn.cursor()
    out_id = cur.var(int)
    cur.execute(
        """
        INSERT INTO SESSIONS (SESSION_HASH, USER_ID, EXPIRES_AT, IP_ADDRESS, USER_AGENT)
        VALUES (:h, :u,
                SYSTIMESTAMP + NUMTODSINTERVAL(:hrs, 'HOUR'),
                :ip, :ua)
        RETURNING SESSION_ID INTO :out_id
        """,
        h=session_hash,
        u=user_id,
        hrs=lifetime_hours,
        ip=ip_address,
        ua=(user_agent or "")[:400] or None,
        out_id=out_id,
    )
    return int(out_id.getvalue()[0])


def get_live(conn: oracledb.Connection, session_hash: str) -> dict[str, Any] | None:
    """Return the session only if it exists, is unrevoked and unexpired.

    The liveness test is done in SQL rather than in Python so there is one
    definition of 'live' and the database clock is the one that decides.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT SESSION_ID, USER_ID, ISSUED_AT, EXPIRES_AT, IP_ADDRESS
          FROM SESSIONS
         WHERE SESSION_HASH = :h
           AND REVOKED_AT IS NULL
           AND EXPIRES_AT > SYSTIMESTAMP
        """,
        h=session_hash,
    )
    return row_to_dict(cur)


def touch(conn: oracledb.Connection, session_id: int, lifetime_hours: int) -> None:
    """Sliding expiry: each authenticated request pushes the expiry out.

    An engineer with the dashboard open for a working day is not signed out
    mid-task, while an abandoned session still lapses.
    """
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE SESSIONS
           SET LAST_SEEN_AT = SYSTIMESTAMP,
               EXPIRES_AT = SYSTIMESTAMP + NUMTODSINTERVAL(:hrs, 'HOUR')
         WHERE SESSION_ID = :i
           AND REVOKED_AT IS NULL
        """,
        hrs=lifetime_hours,
        i=session_id,
    )


def revoke(conn: oracledb.Connection, session_id: int) -> None:
    cur = conn.cursor()
    cur.execute(
        "UPDATE SESSIONS SET REVOKED_AT = SYSTIMESTAMP WHERE SESSION_ID = :i",
        i=session_id,
    )


def revoke_all_for_user(conn: oracledb.Connection, user_id: int) -> None:
    """Used when a password changes or an account is disabled."""
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE SESSIONS
           SET REVOKED_AT = SYSTIMESTAMP
         WHERE USER_ID = :u AND REVOKED_AT IS NULL
        """,
        u=user_id,
    )


def purge_expired(conn: oracledb.Connection, older_than_days: int = 30) -> int:
    cur = conn.cursor()
    cur.execute(
        """
        DELETE FROM SESSIONS
         WHERE EXPIRES_AT < SYSTIMESTAMP - NUMTODSINTERVAL(:d, 'DAY')
        """,
        d=older_than_days,
    )
    return cur.rowcount
