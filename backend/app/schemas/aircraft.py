from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field

class AircraftBase(BaseModel):
    aircraft_number: int = Field(..., description="The unique number of the aircraft (e.g., 1 for AC1)")
    aircraft_mass_kg: float | None = Field(None, description="The mass of the aircraft in kg")

class AircraftCreate(AircraftBase):
    pass

class AircraftUpdate(BaseModel):
    aircraft_mass_kg: float | None = Field(None, description="The mass of the aircraft in kg")

class Aircraft(AircraftBase):
    aircraft_id: int
    modified: datetime | None = None
    flight_count: int = 0  # Useful for the UI to know how many flights belong to this aircraft

    class Config:
        from_attributes = True
