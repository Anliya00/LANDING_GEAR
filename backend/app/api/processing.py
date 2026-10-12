"""The analysis trigger.

The API does not compute anything and does not call the worker. It writes one
status row and returns 202; everything else happens because the analysis worker
is polling. The ingestion worker does the same thing automatically when a
conversion succeeds — this router is the manual and retry path, and the one the
UI's "Re-run analysis" control would call.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status as http

from app.core import status as st
from app.db import analysis_repo
from app.db.pool import connection
from app.deps import current_user
from app.schemas.auth import CurrentUser
from app.schemas.processing import AnalysisQueued, FlightAnalysisStatus

router = APIRouter(prefix="/flights", tags=["analysis"])


@router.post(
    "/{flight_id}/analysis",
    status_code=http.HTTP_202_ACCEPTED,
    response_model=AnalysisQueued,
)
async def queue_analysis(
    flight_id: int,
    user: CurrentUser = Depends(current_user),
) -> AnalysisQueued:
    """Mark a flight for analysis. Returns immediately.

    202, not 200: the work has been accepted, not done. Re-queuing a flight
    that already has results is allowed and is the supported way to recompute
    after a formula change — the delete-then-insert makes it safe.
    """
    with connection() as conn:
        try:
            queued, reason = analysis_repo.queue_for_analysis(
                conn, flight_id, remarks=f"queued by {user.username}"
            )
        except LookupError as exc:
            raise HTTPException(http.HTTP_404_NOT_FOUND, str(exc)) from exc

    if not queued:
        raise HTTPException(http.HTTP_409_CONFLICT, reason)

    return AnalysisQueued(
        flight_id=flight_id,
        status=st.ANALYSIS_PENDING,
        status_label=st.label(st.ANALYSIS_PENDING),
    )


@router.get("/{flight_id}/analysis", response_model=FlightAnalysisStatus)
async def analysis_status(
    flight_id: int,
    _: CurrentUser = Depends(current_user),
) -> FlightAnalysisStatus:
    """Current status for the flight, for the status column in the UI."""
    with connection() as conn:
        flight = analysis_repo.get_flight(conn, flight_id)
        if flight is None:
            raise HTTPException(http.HTTP_404_NOT_FOUND, "No such flight")

    current = flight.get("status")
    return FlightAnalysisStatus(
        flight_id=flight_id,
        status=current,
        status_label=st.label(current),
        aircraft_number=flight.get("aircraft_number"),
        flight_number=flight.get("flight_number"),
    )
