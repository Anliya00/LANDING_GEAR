from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from app.db.pool import connection
from app.db import aircraft_repo
from app.deps import current_user
from app.schemas.auth import CurrentUser
from app.schemas.aircraft import Aircraft, AircraftCreate, AircraftUpdate

router = APIRouter(prefix="/aircrafts", tags=["aircrafts"])

def require_configure_permission(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    # Based on GRANTS in frontend guards.tsx, administrators and engineers have 'configure' permission
    if not any(r in user.roles for r in ["admin", "engineer"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to configure aircrafts."
        )
    return user

@router.get("", response_model=list[Aircraft])
async def list_aircrafts(_: CurrentUser = Depends(current_user)) -> list[Aircraft]:
    with connection() as conn:
        rows = aircraft_repo.list_all(conn)
    return [Aircraft(**r) for r in rows]

@router.post("", response_model=Aircraft, status_code=status.HTTP_201_CREATED)
async def create_aircraft(
    body: AircraftCreate,
    _: CurrentUser = Depends(require_configure_permission)
) -> Aircraft:
    with connection() as conn:
        # Check if aircraft already exists
        existing = aircraft_repo.get_by_number(conn, body.aircraft_number)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Aircraft number {body.aircraft_number} already exists."
            )
        
        aircraft_id = aircraft_repo.create(conn, body.aircraft_number, body.aircraft_mass_kg)
        conn.commit()
    
    # Return the created object
    return Aircraft(
        aircraft_id=aircraft_id,
        aircraft_number=body.aircraft_number,
        aircraft_mass_kg=body.aircraft_mass_kg,
        flight_count=0
    )

@router.put("/{aircraft_id}", response_model=Aircraft)
async def update_aircraft(
    aircraft_id: int,
    body: AircraftUpdate,
    _: CurrentUser = Depends(require_configure_permission)
) -> Aircraft:
    with connection() as conn:
        aircraft_repo.update(conn, aircraft_id, body.aircraft_mass_kg)
        conn.commit()
        
        # Re-fetch to get updated timestamps
        rows = aircraft_repo.list_all(conn)
        updated = next((r for r in rows if r["aircraft_id"] == aircraft_id), None)
        if not updated:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Aircraft not found")
            
    return Aircraft(**updated)

@router.delete("/{aircraft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_aircraft(
    aircraft_id: int,
    _: CurrentUser = Depends(require_configure_permission)
) -> None:
    with connection() as conn:
        # Prevent deletion if flights exist for this aircraft
        rows = aircraft_repo.list_all(conn)
        target = next((r for r in rows if r["aircraft_id"] == aircraft_id), None)
        if not target:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Aircraft not found")
        if target["flight_count"] > 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, 
                "Cannot delete aircraft with existing flights."
            )
            
        aircraft_repo.delete(conn, aircraft_id)
        conn.commit()
