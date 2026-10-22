from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field

class FlightOut(BaseModel):
    flight_id: int
    aircraft_id: int
    aircraft_number: int | None = None
    flight_number: int
    flight_date_time: datetime | None = None
    
    # Masses & Ingestion Times from DB
    configured_mass_kg: float | None = None
    initial_fuel_kg: float | None = None
    initial_mass_kg: float | None = None
    ingestion_start_time: datetime | None = None
    ingestion_end_time: datetime | None = None
    upload_start_time: datetime | None = None
    upload_end_time: datetime | None = None
    
    # Status derived from FLIGHT_STATUS
    status: str = "UNKNOWN"
    error_message: str | None = None
    
    class Config:
        from_attributes = True


class KpiMetric(BaseModel):
    key: str
    title: str
    value: float | None = None
    unit: str = ""
    limit_status: str = "within"  # 'within' | 'near' | 'exceed' | 'na'
    limit_text: str = "Within Limit"
    benchmark: str | None = None


class TimelinePhase(BaseModel):
    id: str
    name: str
    start_time: str
    end_time: str
    start_sec: float
    end_sec: float
    duration_min: float
    color: str


class SignalPoint(BaseModel):
    t: float
    clock: str
    airspeed: float | None = None
    altitude: float | None = None
    brake_pressure: float | None = None
    gear_position: int | None = None  # Unified gear (1 for down, 0 for up)
    ng_position: int | None = None  # Nose Landing Gear (1 for down, 0 for up)
    lh_mlg_position: int | None = None  # Left Main Landing Gear (1 for down, 0 for up)
    rh_mlg_position: int | None = None  # Right Main Landing Gear (1 for down, 0 for up)


class KeySignalsResponse(BaseModel):
    points: list[SignalPoint] = Field(default_factory=list)
    has_real_signals: bool = True


class FlightParamItem(BaseModel):
    param_name: str
    description: str | None = None
    value: float | None = None
    unit: str | None = None
    status: int
    status_label: str


class FlightEventItem(BaseModel):
    event_name: str
    date_time: str | None = None
    occur_seq: int | None = None


class FlightSummaryResponse(BaseModel):
    flight: FlightOut
    kpis: list[KpiMetric]
    total_duration_minutes: float
    timeline_phases: list[TimelinePhase]
    key_signals: KeySignalsResponse
    parameters: list[FlightParamItem]
    events: list[FlightEventItem]
