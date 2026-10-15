from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import sessions_repo, users_repo
from app.db.pool import connection
from app.deps import current_user, require_role
from app.schemas.auth import CurrentUser
from app.schemas.users import (
    AdminResetPasswordRequest,
    RoleMatrixItem,
    UserCreateRequest,
    UserOut,
    UserUpdateRequest,
)
from app.security import passwords

router = APIRouter(prefix="/users", tags=["users"])

# Definitive role-to-page access mapping
ROLE_ACCESS_DEFINITIONS: dict[str, dict[str, list[str]]] = {
    "admin": {
        "permissions": ["manage_users", "ingest", "configure"],
        "accessible_pages": [
            "Home (/)",
            "Flights Catalog & Telemetry (/flights)",
            "Data Ingestion (/ingestion)",
            "Analysis Dashboard (/dashboard)",
            "Aircraft Configuration (/configuration)",
            "User & Role Management (/users)",
        ],
    },
    "engineer": {
        "permissions": ["ingest", "configure"],
        "accessible_pages": [
            "Home (/)",
            "Flights Catalog & Telemetry (/flights)",
            "Data Ingestion (/ingestion)",
            "Analysis Dashboard (/dashboard)",
            "Aircraft Configuration (/configuration)",
        ],
    },
    "operator": {
        "permissions": ["ingest"],
        "accessible_pages": [
            "Home (/)",
            "Flights Catalog & Telemetry (/flights)",
            "Data Ingestion (/ingestion)",
            "Analysis Dashboard (/dashboard)",
        ],
    },
    "viewer": {
        "permissions": [],
        "accessible_pages": [
            "Home (/)",
            "Flights Catalog & Telemetry (/flights)",
            "Analysis Dashboard (/dashboard)",
        ],
    },
}


@router.get("", response_model=list[UserOut])
async def list_users(_: CurrentUser = Depends(require_role("admin"))) -> list[UserOut]:
    """List all registered users from Oracle DB with roles and status."""
    with connection() as conn:
        rows = users_repo.list_all(conn)
    return [
        UserOut(
            user_id=r["user_id"],
            username=r["username"],
            display_name=r["display_name"],
            email=r.get("email"),
            status=r.get("status", "active"),
            roles=r.get("roles", []),
            must_change_pwd=bool(r.get("must_change_pwd")),
            failed_count=r.get("failed_count", 0),
            is_locked=bool(r.get("is_locked")),
            lock_remaining_seconds=r.get("lock_remaining_seconds", 0),
            last_login_at=r.get("last_login_at"),
            created_at=r.get("created_at"),
            created_by=r.get("created_by"),
            updated_at=r.get("updated_at"),
        )
        for r in rows
    ]


@router.get("/roles/matrix", response_model=list[RoleMatrixItem])
async def get_roles_matrix(_: CurrentUser = Depends(require_role("admin"))) -> list[RoleMatrixItem]:
    """Return all roles defined in DB along with their page access entitlements."""
    with connection() as conn:
        db_roles = users_repo.list_roles(conn)

    result: list[RoleMatrixItem] = []
    for r in db_roles:
        code = r["role_code"]
        meta = ROLE_ACCESS_DEFINITIONS.get(code, {
            "permissions": [],
            "accessible_pages": ["Home (/)", "Flights (/flights)", "Analysis Dashboard (/dashboard)"],
        })
        result.append(
            RoleMatrixItem(
                role_code=code,
                role_name=r["role_name"],
                description=r.get("description"),
                permissions=meta["permissions"],
                accessible_pages=meta["accessible_pages"],
            )
        )
    return result


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user_endpoint(
    body: UserCreateRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> UserOut:
    """Create a new user with initial password and role grants in Oracle DB."""
    norm_username = users_repo.normalise_username(body.username)
    
    with connection() as conn:
        existing = users_repo.get_by_username(conn, norm_username)
        if existing:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"User '{norm_username}' already exists.",
            )

        # Hash password using Argon2id
        p_hash = passwords.hash_password(body.password)

        new_id = users_repo.create_user(
            conn,
            username=norm_username,
            display_name=body.display_name,
            password_hash=p_hash,
            email=body.email,
            must_change=body.must_change_pwd,
            created_by=admin.user_id,
        )

        # Grant roles
        if body.roles:
            users_repo.set_user_roles(conn, new_id, body.roles, granted_by=admin.user_id)

        user_rec = users_repo.get_by_id(conn, new_id)
        assigned_roles = users_repo.get_roles(conn, new_id)

    assert user_rec is not None
    return UserOut(
        user_id=user_rec["user_id"],
        username=user_rec["username"],
        display_name=user_rec["display_name"],
        email=user_rec.get("email"),
        status=user_rec.get("status", "active"),
        roles=assigned_roles,
        must_change_pwd=bool(user_rec.get("must_change_pwd")),
        failed_count=0,
        is_locked=False,
        lock_remaining_seconds=0,
        last_login_at=None,
        created_at=None,
        created_by=admin.user_id,
        updated_at=None,
    )


@router.get("/{user_id}", response_model=UserOut)
async def get_user_endpoint(
    user_id: int,
    _: CurrentUser = Depends(require_role("admin")),
) -> UserOut:
    with connection() as conn:
        user_rec = users_repo.get_by_id(conn, user_id)
        if not user_rec:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        assigned_roles = users_repo.get_roles(conn, user_id)

    return UserOut(
        user_id=user_rec["user_id"],
        username=user_rec["username"],
        display_name=user_rec["display_name"],
        email=user_rec.get("email"),
        status=user_rec.get("status", "active"),
        roles=assigned_roles,
        must_change_pwd=bool(user_rec.get("must_change_pwd")),
        failed_count=0,
        is_locked=False,
        lock_remaining_seconds=0,
        last_login_at=user_rec.get("last_login_at"),
        created_at=None,
        created_by=None,
        updated_at=None,
    )


@router.put("/{user_id}", response_model=UserOut)
async def update_user_endpoint(
    user_id: int,
    body: UserUpdateRequest,
    admin: CurrentUser = Depends(require_role("admin")),
) -> UserOut:
    """Update user details, status, and assigned roles."""
    with connection() as conn:
        existing = users_repo.get_by_id(conn, user_id)
        if not existing:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

        # If disabling account, revoke all live sessions
        if body.status.lower() != "active":
            sessions_repo.revoke_all_for_user(conn, user_id)

        users_repo.update_user(
            conn,
            user_id=user_id,
            display_name=body.display_name,
            email=body.email,
            status=body.status,
            must_change=body.must_change_pwd,
        )

        users_repo.set_user_roles(
            conn,
            user_id=user_id,
            role_codes=body.roles,
            granted_by=admin.user_id,
        )

        user_rec = users_repo.get_by_id(conn, user_id)
        assigned_roles = users_repo.get_roles(conn, user_id)

    assert user_rec is not None
    return UserOut(
        user_id=user_rec["user_id"],
        username=user_rec["username"],
        display_name=user_rec["display_name"],
        email=user_rec.get("email"),
        status=user_rec.get("status", "active"),
        roles=assigned_roles,
        must_change_pwd=bool(user_rec.get("must_change_pwd")),
        failed_count=0,
        is_locked=False,
        lock_remaining_seconds=0,
        last_login_at=user_rec.get("last_login_at"),
        created_at=None,
        created_by=None,
        updated_at=None,
    )


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def admin_reset_password_endpoint(
    user_id: int,
    body: AdminResetPasswordRequest,
    _: CurrentUser = Depends(require_role("admin")),
) -> None:
    """Reset password for a user and end all their existing sessions."""
    with connection() as conn:
        existing = users_repo.get_by_id(conn, user_id)
        if not existing:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

        p_hash = passwords.hash_password(body.new_password)
        users_repo.update_password_hash(
            conn,
            user_id=user_id,
            new_hash=p_hash,
            must_change=body.must_change_pwd,
        )
        # Force terminate all active sessions for this user so they must sign in with new credentials
        sessions_repo.revoke_all_for_user(conn, user_id)


@router.post("/{user_id}/unlock", status_code=status.HTTP_204_NO_CONTENT)
async def unlock_user_endpoint(
    user_id: int,
    _: CurrentUser = Depends(require_role("admin")),
) -> None:
    """Clear failed login attempts and unlock account."""
    with connection() as conn:
        existing = users_repo.get_by_id(conn, user_id)
        if not existing:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        users_repo.unlock_user(conn, user_id)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_endpoint(
    user_id: int,
    admin: CurrentUser = Depends(require_role("admin")),
) -> None:
    """Delete user from Oracle DB (cascades to USER_ROLES and SESSIONS)."""
    if user_id == admin.user_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "You cannot delete your own logged-in administrator account.",
        )
    with connection() as conn:
        existing = users_repo.get_by_id(conn, user_id)
        if not existing:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        users_repo.delete_user(conn, user_id)
