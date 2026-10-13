from __future__ import annotations

from pydantic import BaseModel


class AnalysisQueued(BaseModel):
    flight_id: int
    status: str
    status_label: str


class FlightAnalysisStatus(BaseModel):
    flight_id: int
    status: str | None = None
    status_label: str = "Unknown"
    aircraft_number: int | None = None
    flight_number: int | None = None
