"""Request dependencies.

`current_user` resolves the session cookie to a user on every protected route.
`require_role` is the authorisation boundary — the frontend hides what a role
cannot use, but that is courtesy; this is the part that actually refuses.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from app.config import get_settings
from app.db import sessions_repo, users_repo
from app.db.pool import connection
from app.schemas.auth import CurrentUser
from app.security.sessions import hash_token


def client_ip(request: Request) -> str | None:
    """Client address, honouring one layer of reverse proxy.

    X-Forwarded-For is only trustworthy when the app sits behind a proxy that
    sets it. On a direct connection an attacker can forge it, so it is used
    for the audit record rather than for any access decision.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return request.client.host[:45] if request.client else None


async def current_user(request: Request) -> CurrentUser:
    s = get_settings()
    token = request.cookies.get(s.session_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")

    with connection() as conn:
        session = sessions_repo.get_live(conn, hash_token(token))
        if session is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")

        user = users_repo.get_by_id(conn, session["user_id"])
        if user is None or user["status"] != "active":
            # Account disabled while the session was live.
            sessions_repo.revoke(conn, session["session_id"])
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is not active")

        roles = users_repo.get_roles(conn, user["user_id"])
        sessions_repo.touch(conn, session["session_id"], s.session_idle_hours)

    return CurrentUser(
        user_id=user["user_id"],
        username=user["username"],
        display_name=user["display_name"],
        email=user.get("email"),
        roles=roles,
        must_change_password=bool(user.get("must_change_pwd")),
        last_login_at=user.get("last_login_at"),
    )


def require_role(*allowed: str):
    """Dependency factory. `admin` is not implicitly granted everything —
    if a route should be open to admins, name admin in the list."""

    async def _check(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if not set(user.roles) & set(allowed):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Your role does not allow this action",
            )
        return user

    return _check
