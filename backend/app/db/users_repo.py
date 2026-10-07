"""Data access for USERS, ROLES and USER_ROLES."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import oracledb

from app.db.pool import row_to_dict, rows_to_dicts


def normalise_username(raw: str) -> str:
    """Usernames are compared and stored lowercased and trimmed.

    Without this, 'Joe' and 'joe' become two accounts and the UNIQUE
    constraint does not stop it.
    """
    return raw.strip().lower()


def get_by_username(conn: oracledb.Connection, username: str) -> dict[str, Any] | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT USER_ID, USERNAME, DISPLAY_NAME, EMAIL, PASSWORD_HASH, STATUS,
               MUST_CHANGE_PWD, FAILED_COUNT, LOCKED_UNTIL, LAST_LOGIN_AT
          FROM USERS
         WHERE USERNAME = :u
        """,
        u=normalise_username(username),
    )
    return row_to_dict(cur)


def get_by_id(conn: oracledb.Connection, user_id: int) -> dict[str, Any] | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT USER_ID, USERNAME, DISPLAY_NAME, EMAIL, STATUS,
               MUST_CHANGE_PWD, LAST_LOGIN_AT
          FROM USERS
         WHERE USER_ID = :i
        """,
        i=user_id,
    )
    return row_to_dict(cur)


def get_roles(conn: oracledb.Connection, user_id: int) -> list[str]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT ur.ROLE_CODE
          FROM USER_ROLES ur
          JOIN ROLES r ON r.ROLE_CODE = ur.ROLE_CODE
         WHERE ur.USER_ID = :i
         ORDER BY r.SORT_ORDER
        """,
        i=user_id,
    )
    return [r[0] for r in cur.fetchall()]


def list_roles(conn: oracledb.Connection) -> list[dict[str, Any]]:
    cur = conn.cursor()
    cur.execute(
        "SELECT ROLE_CODE, ROLE_NAME, DESCRIPTION FROM ROLES ORDER BY SORT_ORDER"
    )
    return rows_to_dicts(cur)


def record_failed_attempt(
    conn: oracledb.Connection, user_id: int, max_attempts: int, lockout_minutes: int
) -> None:
    """Increment the failure count, and lock the account once it crosses the
    threshold. The lock is temporary — a mistyped password should not need an
    administrator to clear it."""
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE USERS
           SET FAILED_COUNT = FAILED_COUNT + 1,
               LOCKED_UNTIL = CASE
                 WHEN FAILED_COUNT + 1 >= :max_attempts
                 THEN SYSTIMESTAMP + NUMTODSINTERVAL(:mins, 'MINUTE')
                 ELSE LOCKED_UNTIL
               END,
               UPDATED_AT = SYSTIMESTAMP
         WHERE USER_ID = :i
        """,
        max_attempts=max_attempts,
        mins=lockout_minutes,
        i=user_id,
    )


def record_successful_login(conn: oracledb.Connection, user_id: int) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE USERS
           SET FAILED_COUNT = 0,
               LOCKED_UNTIL = NULL,
               LAST_LOGIN_AT = SYSTIMESTAMP,
               UPDATED_AT = SYSTIMESTAMP
         WHERE USER_ID = :i
        """,
        i=user_id,
    )


def update_password_hash(
    conn: oracledb.Connection, user_id: int, new_hash: str, must_change: bool = False
) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE USERS
           SET PASSWORD_HASH = :h,
               MUST_CHANGE_PWD = :m,
               UPDATED_AT = SYSTIMESTAMP
         WHERE USER_ID = :i
        """,
        h=new_hash,
        m=1 if must_change else 0,
        i=user_id,
    )


def is_locked(user: dict[str, Any], now: datetime | None = None) -> bool:
    locked_until = user.get("locked_until")
    if locked_until is None:
        return False
    return locked_until > (now or datetime.now())


def lock_remaining(user: dict[str, Any]) -> timedelta | None:
    locked_until = user.get("locked_until")
    if locked_until is None:
        return None
    delta = locked_until - datetime.now()
    return delta if delta.total_seconds() > 0 else None


def create_user(
    conn: oracledb.Connection,
    username: str,
    display_name: str,
    password_hash: str,
    email: str | None = None,
    must_change: bool = False,
    created_by: int | None = None,
) -> int:
    cur = conn.cursor()
    out_id = cur.var(int)
    cur.execute(
        """
        INSERT INTO USERS (USERNAME, DISPLAY_NAME, EMAIL, PASSWORD_HASH,
                           MUST_CHANGE_PWD, CREATED_BY)
        VALUES (:u, :d, :e, :h, :m, :cb)
        RETURNING USER_ID INTO :out_id
        """,
        u=normalise_username(username),
        d=display_name,
        e=email,
        h=password_hash,
        m=1 if must_change else 0,
        cb=created_by,
        out_id=out_id,
    )
    return int(out_id.getvalue()[0])


def grant_role(
    conn: oracledb.Connection,
    user_id: int,
    role_code: str,
    granted_by: int | None = None,
) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        MERGE INTO USER_ROLES ur
        USING (SELECT :i AS USER_ID, :r AS ROLE_CODE FROM DUAL) src
           ON (ur.USER_ID = src.USER_ID AND ur.ROLE_CODE = src.ROLE_CODE)
        WHEN NOT MATCHED THEN
          INSERT (USER_ID, ROLE_CODE, GRANTED_BY) VALUES (src.USER_ID, src.ROLE_CODE, :gb)
        """,
        i=user_id,
        r=role_code,
        gb=granted_by,
    )
