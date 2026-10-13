"""Read-only queries behind the Analysis Dashboard (requirements D6, section 4).

Everything here reads RESULTS / EVENT_TIMESTAMPS / FLIGHTS and nothing else.
It never writes, never opens a Parquet file and never imports polars: the raw
signals for the time-series plots are read by `app.services.flight_signals`.

RESULTS links to its start / end events by datetime (RESULTS_LINK_MODE=timestamp),
so START_EVENT_TIMESTAMP and END_EVENT_TIMESTAMP come back as datetimes.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import oracledb

from app.db.pool import rows_to_dicts

STATUS_COMPLETE = 1

#: Cards on the Statistics fold, in display order: (param name, card title, kind).
STAT_CARDS: list[tuple[str, str, str]] = [
    ("TOTAL_EXTENSION_CYCLE_TIME", "LG extension cycle time", "extension"),
    ("TOTAL_RETRACTION_CYCLE_TIME", "LG retraction cycle time", "retraction"),
    ("AC_TAKEOFF_MASS", "A/c take-off mass", "mass_up"),
    ("AC_LANDING_MASS", "A/c landing mass", "mass_down"),
    ("SINK_RATE", "Sink rate", "sink"),
    ("MAX_NX_LANDING_ROLL", "Max Nx, landing roll", "nx_max"),
    ("AVG_NX_LANDING_ROLL", "Avg Nx, landing roll", "nx_avg"),
    ("LANDING_ROLL_DISTANCE", "A/c landing roll distance", "runway"),
    ("GROUND_SPEED_CHUTE_DEPLOYMENT", "Chute selection speed", "chute"),
    ("MAX_NZ_TAKEOFF_ROLL", "Max Nz, take-off roll", "nz_up"),
    ("MAX_NZ_LANDING_ROLL", "Max Nz, landing roll", "nz_down"),
]

#: Trend views -> the parameters each plot draws, as (param name, plot title).
TREND_VIEWS: dict[str, list[tuple[str, str]]] = {
    "extension_total": [("TOTAL_EXTENSION_CYCLE_TIME", "LG extension cycle time")],
    "retraction_total": [("TOTAL_RETRACTION_CYCLE_TIME", "LG retraction cycle time")],
    "retraction_gear": [
        ("NOSE_GEAR_RETRACTION_TIME", "Nose gear retraction time"),
        ("RH_GEAR_RETRACTION_TIME", "RH gear retraction time"),
        ("LH_GEAR_RETRACTION_TIME", "LH gear retraction time"),
    ],
    "extension_gear": [
        ("NOSE_GEAR_EXTENSION_TIME", "Nose gear extension time"),
        ("RH_GEAR_EXTENSION_TIME", "RH gear extension time"),
        ("LH_GEAR_EXTENSION_TIME", "LH gear extension time"),
    ],
}


def _day_bounds(date_from: dt.date | None, date_to: dt.date | None) -> tuple[dt.datetime, dt.datetime]:
    """[start, end) datetimes. Missing ends are open."""
    lo = dt.datetime.combine(date_from, dt.time.min) if date_from else dt.datetime(1900, 1, 1)
    hi = (
        dt.datetime.combine(date_to, dt.time.min) + dt.timedelta(days=1)
        if date_to
        else dt.datetime(2999, 1, 1)
    )
    return lo, hi


# ---------------------------------------------------------------------------
# data extent
# ---------------------------------------------------------------------------

def data_extent(conn: oracledb.Connection) -> dict[str, Any]:
    """Earliest / latest flight date that has computed results."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT MIN(f.FLIGHT_DATE_TIME), MAX(f.FLIGHT_DATE_TIME), COUNT(*)
          FROM FLIGHTS f
         WHERE EXISTS (SELECT 1 FROM RESULTS r WHERE r.FLIGHT_ID = f.FLIGHT_ID)
        """
    )
    first, last, count = cur.fetchone()
    return {
        "first": first.date().isoformat() if first else None,
        "last": last.date().isoformat() if last else None,
        "flights": int(count or 0),
    }


def count_flights(
    conn: oracledb.Connection, date_from, date_to, aircraft_number: int | None = None
) -> int:
    lo, hi = _day_bounds(date_from, date_to)
    binds: dict[str, Any] = {"lo": lo, "hi": hi}
    ac = ""
    if aircraft_number is not None:
        ac = " AND f.AIRCRAFT_ID IN (SELECT AIRCRAFT_ID FROM AIRCRAFTS WHERE AIRCRAFT_NUMBER = :ac)"
        binds["ac"] = aircraft_number
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT COUNT(*) FROM FLIGHTS f
         WHERE f.FLIGHT_DATE_TIME >= :lo AND f.FLIGHT_DATE_TIME < :hi
           AND EXISTS (SELECT 1 FROM RESULTS r WHERE r.FLIGHT_ID = f.FLIGHT_ID){ac}
        """,
        binds,
    )
    return int(cur.fetchone()[0])


# ---------------------------------------------------------------------------
# statistics fold
# ---------------------------------------------------------------------------

def statistics(
    conn: oracledb.Connection, date_from, date_to, aircraft_number: int | None = None
) -> list[dict[str, Any]]:
    """Average / min / max / flight count per parameter over the period.

    Only COMPLETE results with a value take part, so a flight missing a
    parameter drops out of that card's figures and counts can differ.
    """
    lo, hi = _day_bounds(date_from, date_to)
    binds: dict[str, Any] = {"ok": STATUS_COMPLETE, "lo": lo, "hi": hi}
    ac = ""
    if aircraft_number is not None:
        ac = " AND f.AIRCRAFT_ID IN (SELECT AIRCRAFT_ID FROM AIRCRAFTS WHERE AIRCRAFT_NUMBER = :ac)"
        binds["ac"] = aircraft_number
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT UPPER(p.PARAM_NAME) AS param_name,
               u.UNIT_NAME         AS unit_name,
               AVG(r.PARAM_VAL)    AS avg_val,
               MIN(r.PARAM_VAL)    AS min_val,
               MAX(r.PARAM_VAL)    AS max_val,
               COUNT(DISTINCT r.FLIGHT_ID) AS flights
          FROM RESULTS r
          JOIN PARAMETERS p ON p.PARAM_ID = r.PARAM_ID
          LEFT JOIN UNITS u ON u.UNIT_ID = p.UNIT_ID
          JOIN FLIGHTS f ON f.FLIGHT_ID = r.FLIGHT_ID
         WHERE r.STATUS = :ok
           AND r.PARAM_VAL IS NOT NULL
           AND f.FLIGHT_DATE_TIME >= :lo AND f.FLIGHT_DATE_TIME < :hi{ac}
         GROUP BY UPPER(p.PARAM_NAME), u.UNIT_NAME
        """,
        binds,
    )
    found = {r["param_name"]: r for r in rows_to_dicts(cur)}

    cards: list[dict[str, Any]] = []
    for name, title, kind in STAT_CARDS:
        row = found.get(name)
        cards.append(
            {
                "param": name,
                "title": title,
                "kind": kind,
                "unit": (row["unit_name"] if row else None),
                "avg": float(row["avg_val"]) if row else None,
                "min": float(row["min_val"]) if row else None,
                "max": float(row["max_val"]) if row else None,
                "flights": int(row["flights"]) if row else 0,
            }
        )
    return cards


# ---------------------------------------------------------------------------
# flight picker
# ---------------------------------------------------------------------------

def list_flights(
    conn: oracledb.Connection,
    aircraft_number: int | None,
    flight_number: int | None,
    on_date: dt.date | None,
) -> dict[str, Any]:
    """Matching flights, newest first, plus the dates that have data.

    `dates` ignores the date filter itself (but honours the other two), so the
    calendar still highlights days the user could switch to.
    """
    where = ["EXISTS (SELECT 1 FROM RESULTS r WHERE r.FLIGHT_ID = f.FLIGHT_ID)"]
    binds: dict[str, Any] = {}
    if aircraft_number is not None:
        where.append("a.AIRCRAFT_NUMBER = :ac")
        binds["ac"] = aircraft_number
    if flight_number is not None:
        where.append("f.FLIGHT_NUMBER = :fn")
        binds["fn"] = flight_number
    base_where = " AND ".join(where)

    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT DISTINCT TRUNC(f.FLIGHT_DATE_TIME)
          FROM FLIGHTS f JOIN AIRCRAFTS a ON a.AIRCRAFT_ID = f.AIRCRAFT_ID
         WHERE {base_where} AND f.FLIGHT_DATE_TIME IS NOT NULL
         ORDER BY 1
        """,
        binds,
    )
    dates = [r[0].date().isoformat() for r in cur]

    list_where, list_binds = base_where, dict(binds)
    if on_date is not None:
        lo, hi = _day_bounds(on_date, on_date)
        list_where += " AND f.FLIGHT_DATE_TIME >= :lo AND f.FLIGHT_DATE_TIME < :hi"
        list_binds.update(lo=lo, hi=hi)

    cur.execute(
        f"""
        SELECT f.FLIGHT_ID, a.AIRCRAFT_NUMBER, f.FLIGHT_NUMBER, f.FLIGHT_DATE_TIME
          FROM FLIGHTS f JOIN AIRCRAFTS a ON a.AIRCRAFT_ID = f.AIRCRAFT_ID
         WHERE {list_where}
         ORDER BY f.FLIGHT_DATE_TIME DESC NULLS LAST, f.FLIGHT_ID DESC
        """,
        list_binds,
    )
    flights = []
    for flight_id, ac, fn, when in cur:
        flights.append(
            {
                "flight_id": int(flight_id),
                "aircraft_number": int(ac) if ac is not None else None,
                "flight_number": int(fn) if fn is not None else None,
                "date": when.date().isoformat() if when else None,
                "start": when.strftime("%H:%M") if when and (when.hour or when.minute) else None,
            }
        )

    cur.execute(
        f"""
        SELECT DISTINCT f.FLIGHT_NUMBER
          FROM FLIGHTS f JOIN AIRCRAFTS a ON a.AIRCRAFT_ID = f.AIRCRAFT_ID
         WHERE {base_where} ORDER BY 1
        """,
        binds,
    )
    numbers = [int(r[0]) for r in cur if r[0] is not None]
    return {"flights": flights, "dates": dates, "flight_numbers": numbers}


def aircraft_numbers(conn: oracledb.Connection) -> list[int]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT DISTINCT a.AIRCRAFT_NUMBER
          FROM AIRCRAFTS a JOIN FLIGHTS f ON f.AIRCRAFT_ID = a.AIRCRAFT_ID
         WHERE EXISTS (SELECT 1 FROM RESULTS r WHERE r.FLIGHT_ID = f.FLIGHT_ID)
         ORDER BY 1
        """
    )
    return [int(r[0]) for r in cur]


def get_flight(conn: oracledb.Connection, flight_id: int) -> dict[str, Any] | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT f.FLIGHT_ID, a.AIRCRAFT_NUMBER, f.FLIGHT_NUMBER, f.FLIGHT_DATE_TIME
          FROM FLIGHTS f JOIN AIRCRAFTS a ON a.AIRCRAFT_ID = f.AIRCRAFT_ID
         WHERE f.FLIGHT_ID = :i
        """,
        i=flight_id,
    )
    row = cur.fetchone()
    if row is None:
        return None
    return {
        "flight_id": int(row[0]),
        "aircraft_number": int(row[1]),
        "flight_number": int(row[2]),
        "flight_date_time": row[3],
    }


# ---------------------------------------------------------------------------
# one flight: triggers, results, events
# ---------------------------------------------------------------------------

def anchors(conn: oracledb.Connection, flight_id: int) -> list[dict[str, Any]]:
    """Every selected lever trigger (UP and DOWN), chronological.

    A selected trigger is one whose OCCUR_SEQ is set; duplicates stored for
    traceability carry NULL and are not triggers.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT LOWER(e.EVENT_COLUMN_NAME), et.DATE_TIME, et.OCCUR_SEQ
          FROM EVENT_TIMESTAMPS et JOIN EVENTS e ON e.EVENT_ID = et.EVENT_ID
         WHERE et.FLIGHT_ID = :f
           AND LOWER(e.EVENT_COLUMN_NAME) IN ('uc_lever_sel_up', 'uc_lever_sel_dn')
           AND e.TRANSITION = 1
           AND et.OCCUR_SEQ IS NOT NULL
         ORDER BY et.DATE_TIME
        """,
        f=flight_id,
    )
    return [
        {"kind": "retraction" if col == "uc_lever_sel_up" else "extension",
         "time": when, "seq": int(seq)}
        for col, when, seq in cur
    ]


def events_between(
    conn: oracledb.Connection, flight_id: int, columns: list[str],
    start: dt.datetime, end: dt.datetime,
) -> list[dict[str, Any]]:
    """Every stored occurrence of the given event columns inside [start, end]."""
    if not columns:
        return []
    marks = ",".join(f":c{i}" for i in range(len(columns)))
    binds: dict[str, Any] = {f"c{i}": c.lower() for i, c in enumerate(columns)}
    binds.update(f=flight_id, s=start, e=end)
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT LOWER(e.EVENT_COLUMN_NAME), e.TRANSITION, et.DATE_TIME, et.OCCUR_SEQ
          FROM EVENT_TIMESTAMPS et JOIN EVENTS e ON e.EVENT_ID = et.EVENT_ID
         WHERE et.FLIGHT_ID = :f
           AND LOWER(e.EVENT_COLUMN_NAME) IN ({marks})
           AND et.DATE_TIME >= :s AND et.DATE_TIME <= :e
         ORDER BY et.DATE_TIME
        """,
        binds,
    )
    return [
        {"column": col, "transition": int(tr), "time": when, "seq": seq}
        for col, tr, when, seq in cur
    ]


def results_for(
    conn: oracledb.Connection, flight_id: int, param_names: list[str]
) -> list[dict[str, Any]]:
    """RESULTS rows of one flight for the named parameters, with their unit."""
    marks = ",".join(f":p{i}" for i in range(len(param_names)))
    binds: dict[str, Any] = {f"p{i}": n.lower() for i, n in enumerate(param_names)}
    binds["f"] = flight_id
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT UPPER(p.PARAM_NAME) AS param_name, u.UNIT_NAME AS unit_name,
               r.PARAM_VAL AS value, r.OCCUR_SEQ AS seq, r.STATUS AS status,
               r.START_EVENT_TIMESTAMP AS start_ts, r.END_EVENT_TIMESTAMP AS end_ts
          FROM RESULTS r
          JOIN PARAMETERS p ON p.PARAM_ID = r.PARAM_ID
          LEFT JOIN UNITS u ON u.UNIT_ID = p.UNIT_ID
         WHERE r.FLIGHT_ID = :f AND LOWER(p.PARAM_NAME) IN ({marks})
         ORDER BY r.OCCUR_SEQ
        """,
        binds,
    )
    return rows_to_dicts(cur)


# ---------------------------------------------------------------------------
# trend fold
# ---------------------------------------------------------------------------

def trend_rows(
    conn: oracledb.Connection, param_names: list[str], date_from, date_to
) -> list[dict[str, Any]]:
    """One row per COMPLETE result in the period: (param, flight date, value)."""
    lo, hi = _day_bounds(date_from, date_to)
    marks = ",".join(f":p{i}" for i in range(len(param_names)))
    binds: dict[str, Any] = {f"p{i}": n.lower() for i, n in enumerate(param_names)}
    binds.update(lo=lo, hi=hi, ok=STATUS_COMPLETE)
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT UPPER(p.PARAM_NAME) AS param_name, r.FLIGHT_ID AS flight_id,
               f.FLIGHT_DATE_TIME AS flight_date, r.PARAM_VAL AS value
          FROM RESULTS r
          JOIN PARAMETERS p ON p.PARAM_ID = r.PARAM_ID
          JOIN FLIGHTS f ON f.FLIGHT_ID = r.FLIGHT_ID
         WHERE LOWER(p.PARAM_NAME) IN ({marks})
           AND r.STATUS = :ok AND r.PARAM_VAL IS NOT NULL
           AND f.FLIGHT_DATE_TIME >= :lo AND f.FLIGHT_DATE_TIME < :hi
         ORDER BY f.FLIGHT_DATE_TIME
        """,
        binds,
    )
    return rows_to_dicts(cur)
