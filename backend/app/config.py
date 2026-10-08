from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Oracle
    oracle_user: str
    oracle_password: str
    oracle_dsn: str
    oracle_pool_min: int = 1
    oracle_pool_max: int = 8

    # Sessions
    session_cookie_name: str = "sftad_session"
    session_idle_hours: int = 12
    session_remember_hours: int = 336
    session_cookie_secure: bool = False

    # Lockout
    max_failed_attempts: int = 8
    lockout_minutes: int = 15

    # Storage
    data_dir: str = "../data"

    # CORS — comma separated
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
