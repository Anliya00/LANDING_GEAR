"""Oracle connection pool.

python-oracledb in thin mode: no Oracle Instant Client installation required.
The pool is created once at application start-up and closed at shutdown.

Every repository function takes a connection rather than acquiring its own, so
that a request which needs several statements can run them in one transaction.
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from typing import Any

import oracledb

from app.config import get_settings

_pool: oracledb.ConnectionPool | None = None


def init_pool() -> None:
    global _pool
    if _pool is not None:
        return
    s = get_settings()
    _pool = oracledb.create_pool(
        user=s.oracle_user,
        password=s.oracle_password,
        dsn=s.oracle_dsn,
        min=s.oracle_pool_min,
        max=s.oracle_pool_max,
        increment=1,
        getmode=oracledb.POOL_GETMODE_WAIT,
    )


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close(force=True)
        _pool = None


@contextlib.contextmanager
def connection() -> Iterator[oracledb.Connection]:
    """Acquire a pooled connection.

    Commits on clean exit, rolls back on exception. Callers that only read are
    unaffected by the commit.
    """
    if _pool is None:
        raise RuntimeError("Connection pool not initialised")
    conn = _pool.acquire()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.release(conn)


def rows_to_dicts(cursor: oracledb.Cursor) -> list[dict[str, Any]]:
    """Fetch all rows as dictionaries keyed by lowercased column name."""
    cols = [d[0].lower() for d in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def row_to_dict(cursor: oracledb.Cursor) -> dict[str, Any] | None:
    cols = [d[0].lower() for d in cursor.description]
    row = cursor.fetchone()
    return dict(zip(cols, row)) if row else None
