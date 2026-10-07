from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.auth.backends import get_backend
from app.config import get_settings
from app.db import sessions_repo, users_repo
from app.db.pool import connection
from app.deps import client_ip, current_user
from app.schemas.auth import (
    ChangePasswordRequest,
    CurrentUser,
    LoginRequest,
    RoleOut,
)
from app.security import passwords
from app.security.sessions import hash_token, new_token

router = APIRouter(prefix="/auth", tags=["auth"])

# One message for every credential failure. Distinguishing "no such user" from
# "wrong password" turns the login form into a way to discover valid usernames.
GENERIC_FAILURE = "Username or password is incorrect"


def _set_session_cookie(response: Response, token: str, max_age_seconds: int) -> None:
    s = get_settings()
    response.set_cookie(
        key=s.session_cookie_name,
        value=token,
        max_age=max_age_seconds,
        httponly=True,       # JavaScript cannot read it, so XSS cannot steal it
        samesite="strict",   # not sent on cross-site requests, so CSRF has no cookie
        secure=s.session_cookie_secure,
        path="/",
    )


@router.post("/login", response_model=CurrentUser)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
) -> CurrentUser:
    s = get_settings()
    backend = get_backend()

    with connection() as conn:
        result = backend.authenticate(conn, body.username, body.password)

        if not result.ok:
            if result.reason == "locked":
                mins = result.retry_after_minutes or s.lockout_minutes
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    f"Too many failed attempts. Try again in {mins} minutes.",
                )
            if result.reason == "inactive":
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "This account is inactive. Contact your administrator.",
                )
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, GENERIC_FAILURE)

        assert result.user_id is not None
        lifetime = s.session_remember_hours if body.remember else s.session_idle_hours
        token = new_token()
        sessions_repo.create(
            conn,
            session_hash=hash_token(token),
            user_id=result.user_id,
            lifetime_hours=lifetime,
            ip_address=client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )

        user = users_repo.get_by_id(conn, result.user_id)
        roles = users_repo.get_roles(conn, result.user_id)

    assert user is not None
    _set_session_cookie(response, token, lifetime * 3600)

    return CurrentUser(
        user_id=user["user_id"],
        username=user["username"],
        display_name=user["display_name"],
        email=user.get("email"),
        roles=roles,
        must_change_password=bool(user.get("must_change_pwd")),
        last_login_at=user.get("last_login_at"),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response) -> Response:
    s = get_settings()
    token = request.cookies.get(s.session_cookie_name)
    if token:
        with connection() as conn:
            session = sessions_repo.get_live(conn, hash_token(token))
            if session:
                sessions_repo.revoke(conn, session["session_id"])
    response.delete_cookie(s.session_cookie_name, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=CurrentUser)
async def me(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    """Called by the frontend on load to decide whether to show the app.

    401 here is the normal unauthenticated answer, not an error condition.
    """
    return user


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    response: Response,
    user: CurrentUser = Depends(current_user),
) -> Response:
    with connection() as conn:
        record = users_repo.get_by_username(conn, user.username)
        if record is None or not passwords.verify_password(
            body.current_password, record["password_hash"]
        ):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Current password is incorrect"
            )

        users_repo.update_password_hash(
            conn, user.user_id, passwords.hash_password(body.new_password)
        )
        # Every other session for this account ends. If the password was
        # changed because it may have leaked, leaving old sessions alive
        # would defeat the point.
        sessions_repo.revoke_all_for_user(conn, user.user_id)

    response.delete_cookie(get_settings().session_cookie_name, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/roles", response_model=list[RoleOut])
async def roles(_: CurrentUser = Depends(current_user)) -> list[RoleOut]:
    with connection() as conn:
        rows = users_repo.list_roles(conn)
    return [RoleOut(**r) for r in rows]
