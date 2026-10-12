"""Flight status values.

These are the strings already written by `services/worker.py` and
`db/job_repo.py`, plus the four the analysis stage needs. FLIGHT_STATUS.STATUS
is a VARCHAR and there is one row per flight, updated in place — that model is
kept as it stands, so nothing here changes how ingestion behaves.

The requirements name the user-visible set as: Uploading, Uploading Failed,
Uploaded - Analysis Pending, Analysis Complete, Analysis Failed. ANALYZING is
added because the analysis worker needs somewhere to park a flight it has
claimed; without it, two workers would both pick up the same pending flight.
"""

from __future__ import annotations

# -- ingestion, already in use ----------------------------------------------
PENDING = "PENDING"                    # queued for Parquet conversion
UPLOADING = "UPLOADING"
UPLOAD_COMPLETE = "UPLOAD COMPLETE"
UPLOAD_FAILED = "UPLOAD FAILED"

# -- analysis ----------------------------------------------------------------
ANALYSIS_PENDING = "ANALYSIS PENDING"  # the analysis worker's queue state
ANALYZING = "ANALYZING"                # claimed by a worker
ANALYSIS_COMPLETE = "ANALYSIS COMPLETE"
ANALYSIS_FAILED = "ANALYSIS FAILED"

#: What the UI shows for each. The requirements spell "Uploaded - Analysis
#: Pending"; the stored value stays the terse one so existing rows still match.
LABELS: dict[str, str] = {
    PENDING: "Pending",
    UPLOADING: "Uploading",
    UPLOAD_COMPLETE: "Uploaded",
    UPLOAD_FAILED: "Uploading Failed",
    ANALYSIS_PENDING: "Uploaded - Analysis Pending",
    ANALYZING: "Analyzing",
    ANALYSIS_COMPLETE: "Analysis Complete",
    ANALYSIS_FAILED: "Analysis Failed",
}

#: Reached the end of ingestion, so analysis may start.
READY_FOR_ANALYSIS = frozenset({UPLOAD_COMPLETE, ANALYSIS_COMPLETE, ANALYSIS_FAILED})

#: A flight in this state must not be re-queued — a worker owns it.
BUSY = frozenset({PENDING, UPLOADING, ANALYZING})

REMARKS_MAX = 50  # FLIGHT_STATUS.REMARKS is VARCHAR2(50) in the live schema


def label(status: str | None) -> str:
    if not status:
        return "Unknown"
    return LABELS.get(status.strip().upper(), status)
