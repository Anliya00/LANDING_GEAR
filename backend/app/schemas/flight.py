from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field

class FlightOut(BaseModel):
    flight_id: int
    aircraft_id: int
    aircraft_number: int | None = None
    flight_number: int
    flight_date_time: datetime | None = None
    
    # Status derived from JOB_QUEUE
    status: str = "UNKNOWN"
    error_message: str | None = None
    
    class Config:
        from_attributes = True
