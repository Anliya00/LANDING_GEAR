import os
import re
from pathlib import Path
from fastapi import APIRouter, Depends

from app.config import get_settings
from app.db.pool import connection
from app.db import flight_repo
from app.deps import current_user
from app.schemas.auth import CurrentUser
from app.schemas.ingestion import ScanResult, FolderInfo

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

@router.get("/folders", response_model=ScanResult)
async def list_folders(user: CurrentUser = Depends(current_user)) -> ScanResult:
    s = get_settings()
    data_dir = Path(s.data_dir).resolve()
    
    # We will fetch existing flights to map statuses
    with connection() as conn:
        db_flights = flight_repo.list_all(conn)
        
    # Map by (aircraft, flight_number) to get status
    # Wait, flight_number in DB is int. In folder it's string like '001'.
    status_map = {}
    for f in db_flights:
        # e.g. key: ("AC1", 1)
        # Handle cases where aircraft_number is missing or present
        ac_num = f["aircraft_number"]
        if ac_num is not None:
            ac_str = f"AC{ac_num}"
            key = (ac_str, f["flight_number"])
            status_map[key] = f["status"]
            
    folders: list[FolderInfo] = []
    
    if data_dir.exists():
        # Look for Aircraft folders first (e.g., AC1, AC2)
        for ac_dir in data_dir.glob("Aircrafts/AC*"):
            if not ac_dir.is_dir():
                continue
                
            aircraft = ac_dir.name # e.g. "AC1"
            
            # Look for flight folders inside
            for flight_dir in ac_dir.iterdir():
                if not flight_dir.is_dir():
                    continue
                    
                folder_name = flight_dir.name
                # Parse AC1_001_01072026 -> Aircraft, FlightID, Date
                parts = folder_name.split("_")
                flight_id_str = parts[1] if len(parts) > 1 else folder_name
                date_str = parts[2] if len(parts) > 2 else "Unknown"
                
                # Count files and size
                raw_dir = flight_dir / "Raw"
                if raw_dir.exists():
                    xlsx_files = list(raw_dir.glob("*.xlsx"))
                else:
                    xlsx_files = list(flight_dir.glob("*.xlsx"))
                file_count = len(xlsx_files)
                size_bytes = sum(f.stat().st_size for f in xlsx_files)
                
                # Check DB status
                try:
                    f_num = int(flight_id_str)
                    db_status = status_map.get((aircraft, f_num))
                except ValueError:
                    db_status = None
                
                status = "Pending"
                error_msg = None
                
                if db_status:
                    status = db_status # e.g. PROCESSING, DONE, FAILED
                else:
                    if file_count < 6:
                        status = "Failed"
                        error_msg = f"Missing files (found {file_count}, expected 6)"
                
                folders.append(FolderInfo(
                    folder_path=str(flight_dir.relative_to(data_dir)),
                    folder_name=folder_name,
                    flight_id=flight_id_str,
                    date_str=date_str,
                    aircraft=aircraft,
                    file_count=file_count,
                    size_bytes=size_bytes,
                    status=status,
                    error_message=error_msg
                ))
                
    # Sort folders by date/name
    folders.sort(key=lambda x: (x.aircraft, x.folder_name), reverse=True)
    return ScanResult(folders=folders)

from datetime import datetime
from app.db import job_repo
from app.schemas.ingestion import StartIngestionRequest

@router.post("/start")
async def start_ingestion(
    req: StartIngestionRequest,
    user: CurrentUser = Depends(current_user)
):
    # Parse folder name: AC1_001_01072026
    parts = req.folder_name.split("_")
    if len(parts) < 2:
        return {"error": "Invalid folder format"}
        
    ac_str = parts[0]
    if not ac_str.startswith("AC"):
        return {"error": "Invalid aircraft format"}
        
    try:
        ac_num = int(ac_str[2:])
        flight_num = int(parts[1])
    except ValueError:
        return {"error": "Aircraft or flight number not numeric"}
        
    # Date parsing (01072026 -> 2026-07-01 or something)
    # We will just use current time or try to parse DDMMYYYY
    dt = datetime.now()
    if len(parts) >= 3:
        dstr = parts[2]
        if len(dstr) == 8:
            try:
                dt = datetime.strptime(dstr, "%d%m%Y")
            except ValueError:
                pass

    with connection() as conn:
        try:
            job_repo.create_flight_and_job(conn, ac_num, flight_num, dt)
            conn.commit()
            return {"status": "ok"}
        except ValueError as e:
            return {"error": str(e)}
