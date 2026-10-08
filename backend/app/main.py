from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_api
from app.api import aircraft as aircraft_api
from app.config import get_settings
from app.db.pool import close_pool, init_pool


import asyncio
from app.services.worker import ingestion_worker

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_pool()
    worker_task = asyncio.create_task(ingestion_worker())
    yield
    worker_task.cancel()
    close_pool()


settings = get_settings()

app = FastAPI(
    title="SFTAD API",
    version="0.1.0",
    description="Smart Flight Test Analytics Dashboard — landing gear group",
    lifespan=lifespan,
)

# allow_credentials with an explicit origin list. It cannot be "*" — browsers
# refuse to send cookies to a wildcard origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_api.router)
app.include_router(aircraft_api.router)
from app.api import flight as flight_api
app.include_router(flight_api.router)
from app.api import ingestion as ingestion_api
app.include_router(ingestion_api.router)

@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
