"""Check the database against what the compute code expects.

    python -m scripts.check_db                 # schema + reference data
    python -m scripts.check_db --flight-id 1   # verify what was written for one flight
    python -m scripts.check_db --flight-id 1 --schema

Read-only. It never writes, so it is safe to run at any point, including
against a database you are not sure about.

Run it BEFORE migration 002 to find out which parts of that script you actually
need, and AFTER a compute run to prove the rows landed correctly.
"""

from __future__ import annotations

import argparse
import sys

from app.compute import registry
from app.config import get_settings
from app.core import status as st
from app.db import reference_repo
from app.db.pool import close_pool, connection, init_pool

OK = "  ok   "
MISS = "  MISS "
WARN = "  warn "

# table -> columns the code reads or writes
EXPECTED: dict[str, list[str]] = {
    "events": ["event_id", "event_name", "event_column_name", "transition", "source_file"],
    "parameters": ["param_id", "param_name", "description", "unit_id"],
    "units": ["unit_id", "unit_name"],
    "event_timestamps": ["event_timestamp_id", "event_id", "flight_id", "date_time", "occur_seq"],
    "results": [
        "result_id", "flight_id", "param_id", "param_val", "occur_seq",
        "start_event_timestamp", "end_event_timestamp", "status",
    ],
    "aircrafts": ["aircraft_id", "aircraft_number", "aircraft_mass_kg"],
    "flights": ["flight_id", "aircraft_id", "flight_number", "flight_date_time"],
    "flight_status": ["flight_status_id", "flight_id", "status", "remarks", "date_time"],
}

SEQUENCES = ["events_seq", "parameters_seq", "units_seq",
             "event_timestamps_seq", "results_seq"]


def _tables(cur) -> set[str]:
    cur.execute("SELECT LOWER(table_name) FROM user_tables")
    return {r[0] for r in cur}


def _columns(cur, table: str) -> dict[str, str]:
    cur.execute(
        "SELECT LOWER(column_name), data_type FROM user_tab_columns "
        "WHERE table_name = UPPER(:t)",
        t=table,
    )
    return {name: dtype for name, dtype in cur}


def _sequences(cur) -> set[str]:
    cur.execute("SELECT LOWER(sequence_name) FROM user_sequences")
    return {r[0] for r in cur}


def check_schema(conn) -> int:
    """Returns the number of problems found."""
    cur = conn.cursor()
    problems = 0
    present = _tables(cur)

    print("TABLES")
    for table, needed in EXPECTED.items():
        if table not in present:
            print(f"{MISS}{table} — does not exist")
            problems += 1
            continue
        actual = _columns(cur, table)
        missing = [c for c in needed if c not in actual]
        if missing:
            print(f"{MISS}{table} — missing column(s): {', '.join(missing)}")
            problems += 1
        else:
            print(f"{OK}{table}")

    # The two column types that silently corrupt data if they are wrong.
    print("\nCOLUMN TYPES THAT MATTER")
    if "event_timestamps" in present:
        dtype = _columns(cur, "event_timestamps").get("date_time", "?")
        if dtype.startswith("TIMESTAMP"):
            print(f"{OK}event_timestamps.date_time is {dtype} — microseconds preserved")
        else:
            print(
                f"{MISS}event_timestamps.date_time is {dtype}. An Oracle DATE has "
                "second resolution, so the microseconds from the TIME column are "
                "lost. It must be TIMESTAMP(6)."
            )
            problems += 1

    settings = get_settings()
    if "results" in present:
        dtype = _columns(cur, "results").get("start_event_timestamp", "?")
        wanted = "id" if dtype == "NUMBER" else "timestamp"
        if settings.results_link_mode == wanted:
            print(
                f"{OK}results.start_event_timestamp is {dtype} and "
                f"RESULTS_LINK_MODE={settings.results_link_mode} — they agree"
            )
        else:
            print(
                f"{MISS}results.start_event_timestamp is {dtype}, so RESULTS_LINK_MODE "
                f"should be '{wanted}', but .env says '{settings.results_link_mode}'. "
                "Inserts will fail with ORA-00932."
            )
            problems += 1

    print("\nSEQUENCES")
    have = _sequences(cur)
    for name in SEQUENCES:
        if name in have:
            print(f"{OK}{name}")
        else:
            print(
                f"{WARN}{name} — absent. The code falls back to MAX(id)+1, which is "
                "single-writer only. Fine for one worker, not for two."
            )

    print("\nSTATUS VALUES IN USE")
    if "flight_status" in present:
        cur.execute("SELECT STATUS, COUNT(*) FROM flight_status GROUP BY STATUS ORDER BY 1")
        for value, count in cur:
            known = (value or "").strip().upper() in st.LABELS
            print(f"{OK if known else WARN}{(value or '(null)'):<22} {int(count):>4} flight(s)"
                  + ("" if known else "   <- not a value this code knows"))
    print(f"       the analysis stage writes: {st.ANALYSIS_PENDING}, {st.ANALYZING}, "
          f"{st.ANALYSIS_COMPLETE}, {st.ANALYSIS_FAILED}")

    print("\nREFERENCE DATA")
    if {"events", "parameters"} <= present:
        missing_events, missing_params = reference_repo.missing_reference(
            conn, registry.all_event_keys(None), set(registry.all_param_definitions(None))
        )
        total_e = len(registry.all_event_keys(None))
        total_p = len(registry.all_param_definitions(None))
        if missing_events or missing_params:
            print(
                f"{MISS}{len(missing_events)}/{total_e} event(s) and "
                f"{len(missing_params)}/{total_p} parameter(s) missing — "
                "run: python -m scripts.seed_reference"
            )
            for key in missing_events:
                print(f"         EVENTS     {key}")
            for name in missing_params:
                print(f"         PARAMETERS {name}")
            problems += 1
        else:
            print(f"{OK}all {total_e} event(s) and {total_p} parameter(s) present")
        try:
            units = reference_repo.load_unit_ids(conn)
            print(f"{OK}UNITS holds {len(units)} row(s): "
                  f"{', '.join(sorted(units)) if units else '(none yet)'}")
            needed = {u.lower() for u, _ in registry.all_param_definitions(None).values()}
            absent = sorted(needed - set(units))
            if absent:
                print(f"{WARN}seed_reference will create UNITS row(s) for: {', '.join(absent)}")
        except Exception as exc:
            print(f"{MISS}cannot read UNITS: {exc}")
            problems += 1
    else:
        print(f"{MISS}events / parameters tables missing, cannot check")

    print("\nFLIGHTS")
    if "flights" in present:
        cur.execute(
            """
            SELECT f.flight_id, a.aircraft_number, f.flight_number, f.flight_date_time,
                   a.aircraft_mass_kg, fs.status
              FROM flights f
              LEFT JOIN aircrafts a ON a.aircraft_id = f.aircraft_id
              LEFT JOIN flight_status fs ON fs.flight_id = f.flight_id
             ORDER BY f.flight_id
            """
        )
        rows = list(cur)
        if not rows:
            print(f"{WARN}no rows in FLIGHTS — nothing to compute yet")
        for flight_id, ac, fno, when, mass, status in rows:
            notes = []
            if when is None:
                notes.append("no FLIGHT_DATE_TIME: cannot compute")
            if mass is None:
                notes.append("no aircraft mass: the two mass parameters will be Incomplete")
            tail = ("   <- " + "; ".join(notes)) if notes else ""
            print(f"       {flight_id:>4}  AC{ac}/{fno:<5} {str(when)[:19]:<20} "
                  f"{st.label(status):<28}{tail}")
            if notes:
                problems += 1
    else:
        print(f"{MISS}flights does not exist")
        problems += 1

    return problems


def check_flight(conn, flight_id: int) -> int:
    """Verify the rows written for one flight. Returns the number of problems."""
    cur = conn.cursor()
    problems = 0

    print(f"FLIGHT {flight_id}")
    cur.execute(
        """
        SELECT a.aircraft_number, f.flight_date_time, fs.status, a.aircraft_mass_kg
          FROM flights f
          LEFT JOIN aircrafts a ON a.aircraft_id = f.aircraft_id
          LEFT JOIN flight_status fs ON fs.flight_id = f.flight_id
         WHERE f.flight_id = :f
        """,
        f=flight_id,
    )
    row = cur.fetchone()
    if row is None:
        print(f"{MISS}no FLIGHTS row")
        return 1
    aircraft, when, status, mass = row
    print(f"       aircraft=AC{aircraft}  date={when}  initial mass={mass}")
    print(f"       status={st.label(status)}")

    print("\nEVENT_TIMESTAMPS")
    cur.execute(
        """
        SELECT e.event_column_name, e.transition,
               COUNT(*),
               SUM(CASE WHEN t.occur_seq IS NULL THEN 1 ELSE 0 END)
          FROM event_timestamps t JOIN events e ON e.event_id = t.event_id
         WHERE t.flight_id = :f
         GROUP BY e.event_column_name, e.transition
         ORDER BY e.event_column_name, e.transition
        """,
        f=flight_id,
    )
    rows = list(cur)
    if not rows:
        print(f"{MISS}no rows — nothing was written for this flight")
        problems += 1
    total = selected = 0
    for column, transition, count, nulls in rows:
        total += int(count)
        selected += int(count) - int(nulls)
        arrow = "0->1" if int(transition) == 1 else "1->0"
        print(f"       {column.lower():<34} {arrow}  {int(count):>4} row(s), "
              f"{int(count) - int(nulls):>4} with occur_seq")
    if rows:
        print(f"       total {total} row(s), {selected} selected, {total - selected} NULL")

    # Microsecond fidelity: if every timestamp has .000000 the column is a DATE
    # or the bind type was wrong.
    cur.execute(
        "SELECT COUNT(*) FROM event_timestamps "
        "WHERE flight_id = :f AND TO_CHAR(date_time, 'FF6') <> '000000'",
        f=flight_id,
    )
    with_micros = int(cur.fetchone()[0])
    if total and with_micros == 0:
        print(f"{WARN}every timestamp has .000000 microseconds. Either the source TIME "
              "really is whole seconds, or date_time is a DATE column.")
    elif total:
        print(f"{OK}{with_micros} of {total} timestamp(s) carry sub-second precision")

    print("\nRESULTS")
    cur.execute(
        """
        SELECT p.param_name, r.occur_seq, r.param_val, r.status,
               r.start_event_timestamp, r.end_event_timestamp
          FROM results r JOIN parameters p ON p.param_id = r.param_id
         WHERE r.flight_id = :f
         ORDER BY r.occur_seq, p.param_name
        """,
        f=flight_id,
    )
    results = list(cur)
    if not results:
        print(f"{MISS}no rows")
        problems += 1
    for name, seq, value, status, start, end in results:
        shown = "NULL" if value is None else f"{float(value):9.3f}"
        label = "Complete" if int(status) == 1 else "Incomplete"
        print(f"       cycle {int(seq):>2}  {name.lower():<32} {shown}  {label}")

    print("\nCONSISTENCY")
    # Complete rows must carry a value and both links; Incomplete rows must not.
    bad = [
        (n, s) for n, s, v, st, a, b in results
        if (int(st) == 1 and (v is None or a is None or b is None))
        or (int(st) == 0 and v is not None)
    ]
    if bad:
        print(f"{MISS}{len(bad)} row(s) where status and value disagree: {bad[:6]}")
        problems += 1
    elif results:
        print(f"{OK}every Complete row has a value and both event links; "
              "every Incomplete row has neither")

    # The total must be at least as large as any single door time in that cycle.
    by_cycle: dict[int, dict[str, float]] = {}
    for name, seq, value, status, _a, _b in results:
        if int(status) == 1 and value is not None:
            by_cycle.setdefault(int(seq), {})[name.lower()] = float(value)
    offenders = []
    for seq, values in by_cycle.items():
        total_time = values.get("total_retraction_cycle_time")
        if total_time is None:
            continue
        doors = [v for k, v in values.items() if k.endswith("door_retraction_time")]
        if doors and total_time + 1e-9 < max(doors):
            offenders.append(seq)
    if offenders:
        print(f"{MISS}cycle(s) {offenders}: the total is shorter than a single door time")
        problems += 1
    elif by_cycle:
        print(f"{OK}in every complete cycle the total is at least the longest door time")

    # Every link must resolve to a real EVENT_TIMESTAMPS row (id mode only).
    if get_settings().results_link_mode == "id":
        cur.execute(
            """
            SELECT COUNT(*) FROM results r
             WHERE r.flight_id = :f
               AND ( (r.start_event_timestamp IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM event_timestamps t
                                       WHERE t.event_timestamp_id = r.start_event_timestamp))
                  OR (r.end_event_timestamp IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM event_timestamps t
                                       WHERE t.event_timestamp_id = r.end_event_timestamp)) )
            """,
            f=flight_id,
        )
        dangling = int(cur.fetchone()[0])
        if dangling:
            print(f"{MISS}{dangling} result(s) point at an event_timestamp_id that does not exist")
            problems += 1
        elif results:
            print(f"{OK}every result link resolves to a real EVENT_TIMESTAMPS row")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flight-id", type=int)
    parser.add_argument("--schema", action="store_true", help="also run the schema check")
    args = parser.parse_args()

    init_pool()
    problems = 0
    try:
        with connection() as conn:
            if args.flight_id is None or args.schema:
                problems += check_schema(conn)
                if args.flight_id is not None:
                    print("\n" + "=" * 72 + "\n")
            if args.flight_id is not None:
                problems += check_flight(conn, args.flight_id)
    finally:
        close_pool()

    print()
    if problems:
        print(f"{problems} problem(s) found.")
        return 1
    print("No problems found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
