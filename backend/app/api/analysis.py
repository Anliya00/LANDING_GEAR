"""Analysis Dashboard API (requirements D6, section 4).

    GET /analysis/meta                          data extent, aircraft, window limits
    GET /analysis/stats                         Statistics fold
    GET /analysis/flights                       flight picker (Time series fold)
    GET /analysis/flights/{id}/triggers         lever triggers / landings of one flight
    GET /analysis/flights/{id}/cycle            retraction or extension plot
    GET /analysis/flights/{id}/landing          landing roll plot
    GET /analysis/trend                         Trend fold

Computed values are read from RESULTS; only the plotted curves come from the
Parquet files, cut to the requested window. Handlers are plain `def` so FastAPI
runs them in its thread pool — reading Parquet must not block the event loop.

Times leave this module as seconds since midnight of the flight's date.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import get_settings
from app.db import dashboard_repo as repo
from app.db.pool import connection
from app.deps import current_user
from app.schemas.auth import CurrentUser
from app.services import flight_signals as sig

router = APIRouter(prefix="/analysis", tags=["analysis"])

CYCLE_CAP_S = 45.0

#: Plot window limits and defaults, seconds before / after the trigger.
WINDOW = {
    "retraction": {"before": (0, 30, 2), "after": (5, 120, 45)},
    "extension": {"before": (0, 30, 2), "after": (5, 120, 45)},
    "landing": {"before": (0, 60, 5), "after": (10, 300, 90)},
}

DOORS = ("NOSE", "RH", "LH")
_DOOR_SIGNALS = {
    "NOSE": ("ng", "nose_door_locked_up", "nose_door_open_limit_reached"),
    "RH": ("rh_mlg", "rh_door_locked_up", "rh_door_open_limit"),
    "LH": ("lh_mlg", "lh_door_locked_up", "lh_door_open_limit"),
}

STEP_NAMES = {
    "retraction": ["Door unlock", "Door open", "Gear downlock release",
                   "Gear uplock", "Door close", "Door lock"],
    "extension": ["Door unlock", "Door open", "Gear uplock release",
                  "Gear downlock", "Door close", "Door lock"],
}


def _chain(kind: str, door: str) -> list[tuple[str, int]]:
    """The six (event column, transition) steps of one door, as in 3.5.1 / 3.5.2."""
    gear, locked_up, open_limit = _DOOR_SIGNALS[door]
    if kind == "retraction":
        release, lock = (f"{gear}_locked_down", 0), (f"{gear}_locked_up", 1)
    else:
        release, lock = (f"{gear}_locked_up", 0), (f"{gear}_locked_down", 1)
    return [(locked_up, 0), (open_limit, 1), release, lock, (open_limit, 0), (locked_up, 1)]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _flight_or_404(conn, flight_id: int) -> dict[str, Any]:
    flight = repo.get_flight(conn, flight_id)
    if flight is None or flight["flight_date_time"] is None:
        raise HTTPException(404, "Flight not found")
    flight["base_date"] = flight["flight_date_time"].date()
    return flight


def _sod(when: dt.datetime | None, base: dt.date) -> float | None:
    return None if when is None else sig.seconds_of_day(when, base)


def _by_seq(rows: list[dict[str, Any]]) -> dict[tuple[str, int], dict[str, Any]]:
    return {(r["param_name"], int(r["seq"])): r for r in rows if r["seq"] is not None}


def _value(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    complete = row["status"] == repo.STATUS_COMPLETE and row["value"] is not None
    return {
        "value": float(row["value"]) if complete else None,
        "unit": row["unit_name"],
        "complete": bool(complete),
    }


def _derived(flight: dict[str, Any]):
    try:
        return sig.find_derived_dir(
            get_settings().data_dir, flight["aircraft_number"], flight["flight_number"]
        )
    except sig.SignalsUnavailable as exc:
        raise HTTPException(404, str(exc)) from exc


def _window(kind: str, before: float | None, after: float | None) -> tuple[float, float]:
    lim = WINDOW[kind]
    b = lim["before"][2] if before is None else before
    a = lim["after"][2] if after is None else after
    b = min(max(b, lim["before"][0]), lim["before"][1])
    a = min(max(a, lim["after"][0]), lim["after"][1])
    return b, a


# ---------------------------------------------------------------------------
# meta / statistics
# ---------------------------------------------------------------------------

@router.get("/meta")
def meta(_: CurrentUser = Depends(current_user)) -> dict[str, Any]:
    with connection() as conn:
        extent = repo.data_extent(conn)
        aircraft = repo.aircraft_numbers(conn)
    return {
        "extent": extent,
        "aircraft": aircraft,
        "windows": {
            k: {"before": {"min": v["before"][0], "max": v["before"][1], "default": v["before"][2]},
                "after": {"min": v["after"][0], "max": v["after"][1], "default": v["after"][2]}}
            for k, v in WINDOW.items()
        },
    }


@router.get("/stats")
def stats(
    date_from: dt.date | None = Query(None, alias="from"),
    date_to: dt.date | None = Query(None, alias="to"),
    aircraft: int | None = None,
    _: CurrentUser = Depends(current_user),
) -> dict[str, Any]:
    with connection() as conn:
        cards = repo.statistics(conn, date_from, date_to, aircraft)
        flights = repo.count_flights(conn, date_from, date_to, aircraft)
    return {"flights": flights, "cards": cards}


# ---------------------------------------------------------------------------
# flight picker
# ---------------------------------------------------------------------------

@router.get("/flights")
def flights(
    aircraft: int | None = None,
    flight_number: int | None = None,
    date: dt.date | None = None,
    _: CurrentUser = Depends(current_user),
) -> dict[str, Any]:
    with connection() as conn:
        return repo.list_flights(conn, aircraft, flight_number, date)


# ---------------------------------------------------------------------------
# one flight: triggers
# ---------------------------------------------------------------------------

@router.get("/flights/{flight_id}/triggers")
def triggers(
    flight_id: int,
    kind: Literal["retraction", "extension", "landing"],
    _: CurrentUser = Depends(current_user),
) -> dict[str, Any]:
    with connection() as conn:
        flight = _flight_or_404(conn, flight_id)
        base = flight["base_date"]

        if kind in ("retraction", "extension"):
            total = "TOTAL_RETRACTION_CYCLE_TIME" if kind == "retraction" else "TOTAL_EXTENSION_CYCLE_TIME"
            rows = _by_seq(repo.results_for(conn, flight_id, [total]))
            items = []
            for a in repo.anchors(conn, flight_id):
                if a["kind"] != kind:
                    continue
                res = rows.get((total, a["seq"]))
                items.append(
                    {"seq": a["seq"], "time": _sod(a["time"], base),
                     "complete": bool(res and res["status"] == repo.STATUS_COMPLETE)}
                )
            return {"kind": kind, "base_date": base.isoformat(), "triggers": items}

        rows = repo.results_for(
            conn, flight_id, ["AC_LANDING_MASS", "SINK_RATE", "MAX_NX_LANDING_ROLL"]
        )
    by = _by_seq(rows)
    seqs = sorted({int(r["seq"]) for r in rows if r["seq"] is not None})
    items = []
    for seq in seqs:
        touch = by.get(("SINK_RATE", seq)) or by.get(("AC_LANDING_MASS", seq))
        nx = by.get(("MAX_NX_LANDING_ROLL", seq))
        items.append(
            {"seq": seq,
             "time": _sod(touch["start_ts"], base) if touch else None,
             "complete": bool(nx and nx["status"] == repo.STATUS_COMPLETE)}
        )
    items.sort(key=lambda i: (i["time"] is None, i["time"]))
    return {"kind": "landing", "base_date": base.isoformat(), "triggers": items}


# ---------------------------------------------------------------------------
# retraction / extension plot
# ---------------------------------------------------------------------------

@router.get("/flights/{flight_id}/cycle")
def cycle(
    flight_id: int,
    kind: Literal["retraction", "extension"],
    seq: int,
    before: float | None = None,
    after: float | None = None,
    _: CurrentUser = Depends(current_user),
) -> dict[str, Any]:
    before, after = _window(kind, before, after)
    with connection() as conn:
        flight = _flight_or_404(conn, flight_id)
        base = flight["base_date"]

        all_anchors = repo.anchors(conn, flight_id)
        trigger = next((a for a in all_anchors if a["kind"] == kind and a["seq"] == seq), None)
        if trigger is None:
            raise HTTPException(404, f"No {kind} cycle {seq} in this flight")

        t0 = trigger["time"]
        later = [a["time"] for a in all_anchors if a["time"] > t0]
        cycle_end = min([t0 + dt.timedelta(seconds=CYCLE_CAP_S), *later[:1]])

        columns = sorted({c for d in DOORS for c, _ in _chain(kind, d)})
        events = repo.events_between(conn, flight_id, columns, t0, cycle_end)

        prefix = "RETRACTION" if kind == "retraction" else "EXTENSION"
        names = [f"TOTAL_{prefix}_CYCLE_TIME"]
        for d in DOORS:
            names += [f"{d}_DOOR_{prefix}_TIME", f"{d}_GEAR_{prefix}_TIME"]
        results = _by_seq(repo.results_for(conn, flight_id, names))

    derived = _derived(flight)
    lo_s, hi_s = _sod(t0, base) - before, _sod(t0, base) + after
    try:
        signals = sig.cycle_signals(derived, lo_s, hi_s)
    except sig.SignalsUnavailable as exc:
        raise HTTPException(404, str(exc)) from exc

    panels = []
    for door in DOORS:
        chain = _chain(kind, door)
        found: list[dict[str, Any]] = []
        prev = t0
        for n, (col, tr) in enumerate(chain, start=1):
            hit = next(
                (e for e in events if e["column"] == col and e["transition"] == tr and e["time"] >= prev),
                None,
            )
            found.append({"n": n, "name": STEP_NAMES[kind][n - 1],
                          "t": _sod(hit["time"], base) if hit else None})
            if hit is None:
                break
            prev = hit["time"]
        found += [{"n": n, "name": STEP_NAMES[kind][n - 1], "t": None}
                  for n in range(len(found) + 1, 7)]

        door_res = results.get((f"{door}_DOOR_{prefix}_TIME", seq))
        gear_res = results.get((f"{door}_GEAR_{prefix}_TIME", seq))
        door_v, gear_v = _value(door_res), _value(gear_res)
        complete = bool(door_v and door_v["complete"] and gear_v and gear_v["complete"])
        missing = next((s for s in found if s["t"] is None), None)
        panels.append(
            {
                "door": door,
                "complete": complete,
                "door_time": door_v["value"] if door_v else None,
                "gear_time": gear_v["value"] if gear_v else None,
                "steps": found,
                "missing": None if complete or missing is None
                else f"Step {missing['n']} ({missing['name'].lower()}) was not found",
                "signals": signals[door],
            }
        )

    total = _value(results.get((f"TOTAL_{prefix}_CYCLE_TIME", seq)))
    return {
        "kind": kind,
        "seq": seq,
        "base_date": base.isoformat(),
        "trigger_time": _sod(t0, base),
        "window": {"start": lo_s, "end": hi_s, "before": before, "after": after},
        "total": total,
        "complete": bool(total and total["complete"]),
        "panels": panels,
    }


# ---------------------------------------------------------------------------
# landing roll plot
# ---------------------------------------------------------------------------

@router.get("/flights/{flight_id}/landing")
def landing(
    flight_id: int,
    seq: int,
    before: float | None = None,
    after: float | None = None,
    _: CurrentUser = Depends(current_user),
) -> dict[str, Any]:
    before, after = _window("landing", before, after)
    names = [
        "AC_LANDING_MASS", "SINK_RATE", "MAX_NX_LANDING_ROLL", "AVG_NX_LANDING_ROLL",
        "GROUND_SPEED_CHUTE_DEPLOYMENT", "LANDING_ROLL_DISTANCE", "MAX_NZ_LANDING_ROLL",
    ]
    with connection() as conn:
        flight = _flight_or_404(conn, flight_id)
        base = flight["base_date"]
        results = _by_seq(repo.results_for(conn, flight_id, names))

    def get(name: str) -> dict[str, Any] | None:
        return results.get((name, seq))

    sink, mass = get("SINK_RATE"), get("AC_LANDING_MASS")
    touch_row = sink or mass
    if touch_row is None or touch_row["start_ts"] is None:
        raise HTTPException(404, f"No landing {seq} in this flight")
    touchdown = _sod(touch_row["start_ts"], base)

    roll = get("LANDING_ROLL_DISTANCE") or get("MAX_NX_LANDING_ROLL")
    chute_row = get("GROUND_SPEED_CHUTE_DEPLOYMENT")
    chute_t = _sod((roll or chute_row or {}).get("start_ts"), base) if (roll or chute_row) else None
    ten_kt = _sod(roll["end_ts"], base) if roll and roll["end_ts"] else None

    derived = _derived(flight)
    lo_s, hi_s = touchdown - before, touchdown + after
    try:
        signals = sig.landing_signals(derived, lo_s, hi_s)
    except sig.SignalsUnavailable as exc:
        raise HTTPException(404, str(exc)) from exc

    values = {
        "sink_rate": _value(sink),
        "chute_speed": _value(chute_row),
        "roll_distance": _value(get("LANDING_ROLL_DISTANCE")),
        "max_nx": _value(get("MAX_NX_LANDING_ROLL")),
        "avg_nx": _value(get("AVG_NX_LANDING_ROLL")),
        "max_nz": _value(get("MAX_NZ_LANDING_ROLL")),
        "landing_mass": _value(mass),
    }
    return {
        "seq": seq,
        "base_date": base.isoformat(),
        "touchdown": touchdown,
        "chute_select": chute_t,
        "ten_kt": ten_kt,
        "has_chute": chute_t is not None,
        "window": {"start": lo_s, "end": hi_s, "before": before, "after": after},
        "values": values,
        "signals": signals,
    }


# ---------------------------------------------------------------------------
# trend
# ---------------------------------------------------------------------------

def _bucket_starts(start: dt.date, end: dt.date, group: str) -> list[dt.date]:
    out: list[dt.date] = []
    if group == "day":
        d = start
        while d <= end:
            out.append(d)
            d += dt.timedelta(days=1)
    elif group == "week":
        d = start
        while d <= end:
            out.append(d)
            d += dt.timedelta(days=7)
    else:  # month: calendar months, the first bucket starts on the period start
        d = start
        while d <= end:
            out.append(d)
            d = (d.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
    return out


def _bucket_of(day: dt.date, starts: list[dt.date]) -> dt.date:
    """The last bucket start on or before `day` (starts are ascending)."""
    chosen = starts[0]
    for s in starts:
        if s <= day:
            chosen = s
        else:
            break
    return chosen


@router.get("/trend")
def trend(
    view: Literal["extension_total", "retraction_total", "retraction_gear", "extension_gear"],
    group: Literal["day", "week", "month"] = "day",
    date_from: dt.date | None = Query(None, alias="from"),
    date_to: dt.date | None = Query(None, alias="to"),
    _: CurrentUser = Depends(current_user),
) -> dict[str, Any]:
    plots_def = repo.TREND_VIEWS[view]
    with connection() as conn:
        extent = repo.data_extent(conn)
        start = date_from or (dt.date.fromisoformat(extent["first"]) if extent["first"] else None)
        end = date_to or (dt.date.fromisoformat(extent["last"]) if extent["last"] else None)
        if start is None or end is None or end < start:
            return {"flights": 0, "from": None, "to": None, "group": group, "plots": []}
        rows = repo.trend_rows(conn, [p for p, _ in plots_def], start, end)
        flights_in_period = repo.count_flights(conn, start, end)

    starts = _bucket_starts(start, end, group)
    if len(starts) > 2000:
        raise HTTPException(400, "Too many groups for this period; choose a coarser grouping")

    per_param: dict[str, dict[dt.date, list[float]]] = defaultdict(lambda: defaultdict(list))
    for r in rows:
        bucket = _bucket_of(r["flight_date"].date(), starts)
        per_param[r["param_name"]][bucket].append(float(r["value"]))

    plots = []
    for param, title in plots_def:
        buckets = []
        for s in starts:
            vals = per_param[param].get(s)
            buckets.append(
                {
                    "start": s.isoformat(),
                    "avg": sum(vals) / len(vals) if vals else None,
                    "min": min(vals) if vals else None,
                    "max": max(vals) if vals else None,
                    "n": len(vals) if vals else 0,
                }
            )
        plots.append({"param": param, "title": title, "unit": "s", "buckets": buckets})

    return {
        "flights": flights_in_period,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "group": group,
        "plots": plots,
    }
