"""The analysis worker: a second background task alongside `ingestion_worker`.

The requirements ask for this explicitly:

    Engineering parameter calculation shall be performed as a separate,
    asynchronous background process, triggered automatically upon successful
    upload and validation. [...] The user shall not experience any lag or delay
    during the upload process on account of engineering parameter calculation.

So it is a task of its own, not a second stage inside the ingestion loop. A
flight that takes a minute to compute does not hold up the next upload's
Parquet conversion, and a second worker can be added later without changing
anything here.

The queue is the FLIGHT_STATUS table. There is no broker: the ingestion worker
writes ANALYSIS PENDING when conversion succeeds, and this task's poll is the
dequeue. `FOR UPDATE ... SKIP LOCKED` is what makes two workers safe.

The compute itself is blocking CPU and file work, so it runs in a thread via
`asyncio.to_thread` — exactly as the ingestion worker does for the Parquet
conversion. Without that it would stall the event loop and the API with it.
"""

from __future__ import annotations

import asyncio
import logging
import traceback

from app.compute.pipeline import FlightNotComputable, run_compute
from app.core import status as st
from app.db import analysis_repo
from app.db.pool import connection

logger = logging.getLogger("worker.analysis")

POLL_INTERVAL_S = 5.0
#: A flight left ANALYZING longer than this belongs to a worker that died.
STALE_TIMEOUT_S = 1800
#: Sweep roughly every 5 minutes of idling, not on every tick.
SWEEP_EVERY_TICKS = 60

WORKER_ID = "analysis"


async def analysis_worker() -> None:
    """Claim flights awaiting analysis and compute their parameters."""
    logger.info("analysis worker starting")
    idle = 0

    try:
        await asyncio.to_thread(_sweep)
    except Exception:
        logger.exception("startup sweep failed")

    while True:
        try:
            flight = await asyncio.to_thread(_claim)
            if flight is None:
                idle += 1
                if idle % SWEEP_EVERY_TICKS == 1:
                    await asyncio.to_thread(_sweep)
                await asyncio.sleep(POLL_INTERVAL_S)
                continue

            idle = 0
            # Blocking: reads several Parquet files and writes to Oracle.
            await asyncio.to_thread(_process, flight)

        except asyncio.CancelledError:
            logger.info("analysis worker stopping")
            raise
        except Exception:
            logger.exception("analysis worker iteration failed")
            await asyncio.sleep(POLL_INTERVAL_S)


# ---------------------------------------------------------------------------
# the blocking half — each runs in a worker thread with its own connection
# ---------------------------------------------------------------------------

def _claim() -> dict | None:
    with connection() as conn:
        return analysis_repo.claim_next_pending(conn, WORKER_ID)


def _sweep() -> int:
    with connection() as conn:
        return analysis_repo.requeue_stale(conn, STALE_TIMEOUT_S)


def _process(flight: dict) -> None:
    """Compute one claimed flight and record the outcome.

    `run_compute` commits each family itself, so by the time the status is
    written the results are already durable. A family that failed has been
    rolled back on its own and logged; the flight still completes.
    """
    flight_id = flight["flight_id"]
    try:
        with connection() as conn:
            families = run_compute(conn, flight_id)
    except FlightNotComputable as exc:
        _fail(flight_id, f"{type(exc).__name__}: {exc}")
        return
    except Exception as exc:  # noqa: BLE001 — one flight must not kill the worker
        logger.exception("flight_id=%s analysis failed", flight_id)
        _fail(flight_id, f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}")
        return

    with connection() as conn:
        analysis_repo.set_status(
            conn, flight_id, st.ANALYSIS_COMPLETE, f"families: {', '.join(families)}"
        )
    logger.info("flight_id=%s analysis complete (%s)", flight_id, ", ".join(families))


def _fail(flight_id: int, reason: str) -> None:
    logger.error("flight_id=%s -> Analysis Failed: %s", flight_id, reason)
    try:
        with connection() as conn:
            analysis_repo.set_status(conn, flight_id, st.ANALYSIS_FAILED, reason)
    except Exception:
        # The flight stays ANALYZING and the stale sweep will requeue it.
        logger.exception("could not record the failure for flight_id=%s", flight_id)
