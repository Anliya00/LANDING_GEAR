from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=256)
    remember: bool = False


class CurrentUser(BaseModel):
    user_id: int
    username: str
    display_name: str
    email: str | None = None
    roles: list[str]
    must_change_password: bool = False
    last_login_at: datetime | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class RoleOut(BaseModel):
    role_code: str
    role_name: str
    description: str | None = None