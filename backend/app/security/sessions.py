"""Session identifiers.

The cookie carries an opaque random token. Only its SHA-256 is stored, so a
read of the SESSIONS table does not hand over live sessions. The token has no
structure and no claims — the database is the source of truth, which is what
makes a session revocable the instant a row is updated.
"""

from __future__ import annotations

import hashlib
import secrets

TOKEN_BYTES = 32  # 256 bits


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
