"""Password hashing.

Argon2id, via argon2-cffi. The encoded hash carries its own algorithm,
parameters and salt, so raising the cost later needs no schema change — only
`needs_rehash` returning True and the hash being replaced on next sign-in.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()

# A real Argon2id hash of a value nobody holds. Verifying against this when the
# username is unknown keeps the failed-login path roughly the same duration as
# the successful one, so response timing does not reveal which usernames exist.
_DUMMY_HASH = _hasher.hash("no-such-account-timing-equaliser")


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, encoded: str) -> bool:
    try:
        return _hasher.verify(encoded, plain)
    except (VerifyMismatchError, InvalidHashError):
        return False
    except Exception:
        return False


def burn_time() -> None:
    """Spend the same work as a real verification, for unknown usernames."""
    verify_password("x", _DUMMY_HASH)


def needs_rehash(encoded: str) -> bool:
    try:
        return _hasher.check_needs_rehash(encoded)
    except Exception:
        return False
