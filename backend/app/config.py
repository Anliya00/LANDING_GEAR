"""Settings. REPLACES the existing backend/app/config.py.

Only the Compute block at the bottom is new; everything above it is unchanged
from the current file, `data_dir` included. Every field name maps to an
environment variable of the same name, and `.env` is read automatically.
Fields with no default are required — the process refuses to start without
them rather than connecting somewhere unintended.
"""

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

    # --- Compute (new) -----------------------------------------------------

    #: Which parameter families the analysis worker runs, in order. Comma
    #: separated. Each must be registered in app.compute.registry.
    compute_families: str = (
        "retraction,extension,mass,sink_rate,landing_roll,load_factor"
    )

    #: How RESULTS points at the two events a value was measured between.
    #: "id"        — START/END_EVENT_TIMESTAMP hold EVENT_TIMESTAMP_ID, which is
    #:               what the requirements specify
    #: "timestamp" — they hold the datetimes themselves
    #: `python -m scripts.check_db` reads the real column type and tells you
    #: which value this needs.
    results_link_mode: str = "id"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def compute_family_list(self) -> list[str]:
        return [f.strip() for f in self.compute_families.split(",") if f.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
