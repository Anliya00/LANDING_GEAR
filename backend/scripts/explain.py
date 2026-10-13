"""Show where every computed number came from, so it can be checked by hand.

    python -m scripts.explain --derived ../data/AC2/AC2_001_10072026/Derived --initial-mass 12883
    python -m scripts.explain --flight-id 1

Needs no database in --derived mode.

`run_compute` tells you what the answers are. This tells you how each one was
arrived at: the exact TIME strings of the samples it was measured between, the
raw values read from each file, and the arithmetic. Every TIME printed here can
be searched for in the corresponding .xlsx, so an engineer can confirm a value
without reading any Python.

Verifying four or five rows this way is worth more than re-reading the code.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.compute import orchestrator, registry
from app.compute.families import landing_roll, load_factor, mass, sink_rate
from app.compute.models import FlightContext, Occurrence
from app.compute.phases import G, KNOTS_TO_MS

RULE = "=" * 78


def _ts(occurrence: Occurrence | None) -> str:
    return occurrence.source_time if occurrence else "—"


def _hhmmss(seconds: float) -> str:
    whole = int(seconds) % 86400
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def explain(derived: Path, initial_mass: float | None) -> int:
    run = orchestrator.open_flight(derived, None, FlightContext(initial_mass_kg=initial_mass))
    signals, phases = run.signals, run.phases

    print(RULE)
    print(f"FLIGHT  {derived.parent.name}")
    print(RULE)
    for key in sorted(registry.all_source_files(None)):
        frame = signals.frame(key)
        print(f"  {key}: {frame.height:>7} rows, "
              f"{frame['time'][0]} .. {frame['time'][-1]}")

    # ---- phases ----------------------------------------------------------
    print(f"\n{RULE}\nFLIGHT PHASES — check these first; six families depend on them\n{RULE}")
    for take_off in phases.take_offs:
        print(f"\n  TAKE-OFF {take_off.seq}")
        print(f"    roll starts   {_ts(take_off.roll_start):<18}  last wheel-speed = 0 before the climb")
        print(f"    lift-off      {_ts(take_off.anchor):<18}  WOW_NOSE 1->0")
        if take_off.roll_window:
            a, b = take_off.roll_window
            print(f"    roll lasts    {b - a:.2f} s")
    for landing in phases.landings:
        print(f"\n  LANDING {landing.seq}")
        print(f"    anchor        {_ts(landing.anchor):<18}  {landing.anchor.key.column}")
        print(f"    touchdown     {_ts(landing.touchdown):<18}  wheel speed leaves 0")
        print(f"    chute         {_ts(landing.chute):<18}  CHUTE_SELECT 0->1")
        print(f"    10 kt point   {_ts(landing.decay):<18}  wheel speed falls back to <= 5.14 m/s")
        a, b = landing.window
        print(f"    window lasts  {b - a:.2f} s"
              + (f", landing roll {landing.decay.t - landing.chute.t:.2f} s" if landing.chute else ""))
    for note in phases.warnings:
        print(f"\n  ! {note}")

    # ---- cycle families --------------------------------------------------
    for family in ("retraction", "extension"):
        output = orchestrator.compute_family(family, run)
        print(f"\n{RULE}\n{family.upper()} — each value is end minus start\n{RULE}")
        for result in output.results:
            if result.value is None:
                print(f"  {result.param_name:<32} INCOMPLETE (a chain step was not found)")
                continue
            print(f"  {result.param_name:<32} {result.value:9.4f} s")
            print(f"      from {_ts(result.start)}  ({result.start.key})")
            print(f"      to   {_ts(result.end)}  ({result.end.key})")

    # ---- mass ------------------------------------------------------------
    output = orchestrator.compute_family("mass", run)
    print(f"\n{RULE}\nMASS — fuel used is the first REMN_FF minus the reading at the event\n{RULE}")
    times, values, raw = signals.series(mass.FUEL_FILE, mass.FUEL_COLUMN)
    print(f"  REMN_FF first sample   {raw[0]}  = {values[0]:.0f} kg   <- INITIAL_FUEL_LOADED")
    print(f"  REMN_FF last sample    {raw[-1]}  = {values[-1]:.0f} kg")
    print(f"  aircraft initial mass  {initial_mass} kg (from AIRCRAFTS)")
    for result in output.results:
        if result.param_name == mass.INITIAL_FUEL_LOADED:
            continue
        if result.value is None:
            print(f"\n  {result.param_name:<24} INCOMPLETE")
            continue
        found = signals.nearest(mass.FUEL_FILE, mass.FUEL_COLUMN, result.start.t)
        at_t, remaining, at_raw = found
        print(f"\n  {result.param_name:<24} {result.value:12.2f} kg")
        print(f"      event at          {_ts(result.start)}")
        print(f"      nearest REMN_FF   {at_raw}  = {remaining:.0f} kg  ({at_t - result.start.t:+.3f} s away)")
        if "FUEL_USED" in result.param_name:
            print(f"      {values[0]:.0f} - {remaining:.0f} = {result.value:.0f} kg")
        else:
            print(f"      {initial_mass:.0f} - {values[0] - remaining:.0f} = {result.value:.0f} kg")

    # ---- sink rate -------------------------------------------------------
    output = orchestrator.compute_family("sink_rate", run)
    print(f"\n{RULE}\nSINK RATE — VER_LIN_VELOCITY at the sample nearest touchdown\n{RULE}")
    for result in output.results:
        if result.value is None:
            print("  SINK_RATE                        INCOMPLETE"); continue
        found = signals.nearest(sink_rate.SOURCE, sink_rate.COLUMN, result.start.t)
        at_t, value, at_raw = found
        print(f"  SINK_RATE                 {result.value:12.6f}")
        print(f"      touchdown at      {_ts(result.start)}")
        print(f"      nearest sample    {at_raw}  = {value:.6f}  ({at_t - result.start.t:+.4f} s away)")

    # ---- landing roll ----------------------------------------------------
    output = orchestrator.compute_family("landing_roll", run)
    print(f"\n{RULE}\nLANDING ROLL — chute selection to the 10 kt point\n{RULE}")
    for landing in phases.landings:
        if landing.roll_window is None:
            print(f"  landing {landing.seq}: no chute selection, roll undefined"); continue
        start, end = landing.roll_window
        nt, nv = signals.between(landing_roll.NX_FILE, landing_roll.NX_COLUMN, start, end)
        st, sv = signals.between(landing_roll.SPEED_FILE, landing_roll.SPEED_COLUMN, start, end)
        print(f"\n  landing {landing.seq}: {_ts(landing.chute)} .. {_ts(landing.decay)}"
              f"  ({end - start:.2f} s)")
        print(f"      NX_DATA samples in window      {len(nv):>6}   "
              f"min {min(nv):.4f}  max {max(nv):.4f}")
        print(f"      GROUND_SPEED samples in window {len(sv):>6}   "
              f"first {sv[0]:.2f} kt  last {sv[-1]:.2f} kt")
        if len(sv) > 1:
            span = st[-1] - st[0]
            mean_kt = sum(sv) / len(sv)
            print(f"      cross-check: mean {mean_kt:.2f} kt x {span:.2f} s x 0.514444 "
                  f"= {mean_kt * span * KNOTS_TO_MS:.1f} m  (trapezoid gives the exact figure)")
    for result in output.results:
        value = "INCOMPLETE" if result.value is None else f"{result.value:12.4f}"
        print(f"  {result.param_name:<32} {value}")

    # ---- load factor -----------------------------------------------------
    output = orchestrator.compute_family("load_factor", run)
    print(f"\n{RULE}\nMAX NZ — largest VERTICAL_ACCELERATION in the window, divided by {G}\n{RULE}")
    for result in output.results:
        if result.value is None:
            print(f"  {result.param_name:<32} INCOMPLETE"); continue
        _, values = signals.between(
            load_factor.SOURCE, load_factor.COLUMN, result.start.t, result.end.t
        )
        print(f"  {result.param_name:<32} {result.value:9.4f} g")
        print(f"      window      {_ts(result.start)} .. {_ts(result.end)}")
        print(f"      {len(values)} sample(s), largest {max(values):.4f} / {G} = {result.value:.4f}")

    print(f"\n{RULE}")
    print("Every TIME above appears verbatim in the matching .xlsx. Pick a few and")
    print("confirm them against the raw file; that checks the detection, the window")
    print("and the arithmetic in one go.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--derived", help="a flight's Derived folder")
    parser.add_argument("--flight-id", type=int, help="look the folder and mass up in the database")
    parser.add_argument("--initial-mass", type=float, help="aircraft mass in kg, with --derived")
    args = parser.parse_args()

    if args.flight_id is not None:
        from app.compute.pipeline import resolve_derived
        from app.db import analysis_repo
        from app.db.pool import close_pool, connection, init_pool

        init_pool()
        try:
            with connection() as conn:
                flight = analysis_repo.get_flight(conn, args.flight_id)
                if flight is None:
                    print(f"no FLIGHTS row for flight_id={args.flight_id}")
                    return 2
                return explain(
                    resolve_derived(flight), analysis_repo.initial_mass(conn, args.flight_id)
                )
        finally:
            close_pool()

    if not args.derived:
        parser.error("give --derived or --flight-id")
    return explain(Path(args.derived), args.initial_mass)


if __name__ == "__main__":
    raise SystemExit(main())
