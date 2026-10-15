from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class UserOut(BaseModel):
    user_id: int
    username: str
    display_name: str
    email: str | None = None
    status: str
    roles: list[str] = Field(default_factory=list)
    must_change_pwd: bool = False
    failed_count: int = 0
    is_locked: bool = False
    lock_remaining_seconds: int = 0
    last_login_at: datetime | None = None
    created_at: datetime | None = None
    created_by: int | None = None
    updated_at: datetime | None = None


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60)
    display_name: str = Field(min_length=1, max_length=120)
    email: str | None = None
    password: str = Field(min_length=8, max_length=256)
    roles: list[str] = Field(default_factory=list)
    must_change_pwd: bool = True


class UserUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    email: str | None = None
    status: str = Field(default="active")
    roles: list[str] = Field(default_factory=list)
    must_change_pwd: bool = False


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=256)
    must_change_pwd: bool = True


class RoleMatrixItem(BaseModel):
    role_code: str
    role_name: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)
    accessible_pages: list[str] = Field(default_factory=list)
