from __future__ import annotations

from fastapi import APIRouter, Depends
from app.db.pool import connection
from app.db import flight_repo
from app.deps import current_user
from app.schemas.auth import CurrentUser
from app.schemas.flight import FlightOut

router = APIRouter(prefix="/flights", tags=["flights"])

@router.get("", response_model=list[FlightOut])
async def list_flights(_: CurrentUser = Depends(current_user)) -> list[FlightOut]:
    with connection() as conn:
        rows = flight_repo.list_all(conn)
        
    return [
        FlightOut(
            flight_id=r["flight_id"],
            aircraft_id=r["aircraft_id"],
            aircraft_number=r["aircraft_number"],
            flight_number=r["flight_number"],
            flight_date_time=r["flight_date_time"],
            status=r["status"] or "UNKNOWN",
            error_message=r.get("error_message")
        )
        for r in rows
    ]
