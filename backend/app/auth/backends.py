"""Authentication backends.

The interface exists so that an LDAP or Active Directory backend can be added
later as a second implementation and a config switch, rather than as a rewrite
of the login endpoint. Everything above this layer deals in `AuthResult`, not
in passwords.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import oracledb

from app.config import get_settings
from app.db import users_repo
from app.security import passwords


class AuthError(str):
    """Reason codes. Deliberately coarse at the API boundary — see api/auth.py."""


@dataclass
class AuthResult:
    ok: bool
    user_id: int | None = None
    reason: str | None = None  # "invalid" | "locked" | "inactive"
    retry_after_minutes: int | None = None


class AuthBackend(Protocol):
    def authenticate(
        self, conn: oracledb.Connection, username: str, password: str
    ) -> AuthResult: ...


class LocalPasswordBackend:
    """Verifies against the Argon2id hash stored in USERS."""

    def authenticate(
        self, conn: oracledb.Connection, username: str, password: str
    ) -> AuthResult:
        s = get_settings()
        user = users_repo.get_by_username(conn, username)

        if user is None:
            # Spend comparable time so response duration does not reveal
            # whether the username exists.
            passwords.burn_time()
            return AuthResult(ok=False, reason="invalid")

        if users_repo.is_locked(user):
            remaining = users_repo.lock_remaining(user)
            mins = int(remaining.total_seconds() // 60) + 1 if remaining else None
            return AuthResult(ok=False, reason="locked", retry_after_minutes=mins)

        if user["status"] != "active":
            passwords.burn_time()
            return AuthResult(ok=False, reason="inactive")

        if not passwords.verify_password(password, user["password_hash"]):
            users_repo.record_failed_attempt(
                conn, user["user_id"], s.max_failed_attempts, s.lockout_minutes
            )
            return AuthResult(ok=False, reason="invalid")

        # Opportunistic upgrade if the cost parameters have been raised since
        # this hash was written.
        if passwords.needs_rehash(user["password_hash"]):
            users_repo.update_password_hash(
                conn, user["user_id"], passwords.hash_password(password)
            )

        users_repo.record_successful_login(conn, user["user_id"])
        return AuthResult(ok=True, user_id=user["user_id"])


def get_backend() -> AuthBackend:
    return LocalPasswordBackend()
