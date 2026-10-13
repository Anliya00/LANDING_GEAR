"""Raw signals for the time-series plots, cut to a window.

The dashboard's computed values come from RESULTS; only the *curves* come from
here. Each call opens the Parquet files of one flight, keeps the columns the
plot needs and returns just the window, so nothing large ever reaches the
browser.

Time is returned as seconds since midnight of the flight's date (the files carry
only a clock; the date comes from FLIGHTS). A flight that crosses midnight keeps
counting past 86 400, and the frontend formats that back to a clock time.

This module imports polars and never oracledb.
"""

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path
from typing import Any

import polars as pl

KNOTS_TO_MS = 0.514444
_WRAP_THRESHOLD_S = 43_200.0
_MAX_ANALOG_POINTS = 1500
_FLIGHT_DIR = re.compile(r"^AC(?P<ac>\d+)_(?P<fn>\d+)_(?P<date>\d{8})$", re.IGNORECASE)


class SignalsUnavailable(Exception):
    """The Parquet files for the flight cannot be found or read."""


# ---------------------------------------------------------------------------
# locating a flight's folder
# ---------------------------------------------------------------------------

def find_derived_dir(data_dir: str | Path, aircraft_number: int, flight_number: int) -> Path:
    """data/AC<n>/AC<n>_<NNN>_<ddmmyyyy>/Derived — also under data/Aircrafts/."""
    root = Path(data_dir)
    for base in (root, root / "Aircrafts"):
        ac_dir = base / f"AC{aircraft_number}"
        if not ac_dir.is_dir():
            continue
        for child in sorted(ac_dir.iterdir()):
            m = _FLIGHT_DIR.match(child.name)
            if m and int(m["ac"]) == aircraft_number and int(m["fn"]) == flight_number:
                derived = child / "Derived"
                if derived.is_dir():
                    return derived
    raise SignalsUnavailable(
        f"no Derived folder for AC{aircraft_number} flight {flight_number} under {root}"
    )


# ---------------------------------------------------------------------------
# reading
# ---------------------------------------------------------------------------

def _with_seconds(df: pl.DataFrame) -> pl.DataFrame:
    """Add `t`: seconds since midnight, made monotonic across a midnight wrap."""
    parts = pl.col("time").str.split(":")
    df = df.with_columns(
        (
            parts.list.get(0).cast(pl.Int64) * 3600
            + parts.list.get(1).cast(pl.Int64) * 60
            + parts.list.get(2).cast(pl.Int64)
            + parts.list.get(3).cast(pl.Float64) / 1_000_000
        ).alias("t")
    )
    wraps = (pl.col("t").diff() < -_WRAP_THRESHOLD_S).fill_null(False).cast(pl.Int64).cum_sum()
    return df.with_columns((pl.col("t") + wraps * 86_400.0).alias("t"))


def _read(derived: Path, stem: str, columns: list[str], lo: float, hi: float) -> pl.DataFrame:
    path = derived / f"{stem}.parquet"
    if not path.is_file():
        raise SignalsUnavailable(f"{path.name} is missing from {derived}")
    try:
        df = pl.read_parquet(path, columns=["time", *columns])
    except Exception as exc:  # noqa: BLE001 - surfaced to the user as one message
        raise SignalsUnavailable(f"cannot read {path.name}: {exc}") from exc
    df = _with_seconds(df)
    return df.filter((pl.col("t") >= lo) & (pl.col("t") <= hi))


def _binary(df: pl.DataFrame, column: str, lo: float, hi: float) -> list[list[float]]:
    """A 0/1 signal as change points only: [[t, v], ...] spanning the window."""
    if df.height == 0:
        return []
    t = df["t"].to_list()
    v = [int(x) if x is not None else 0 for x in df[column].to_list()]
    out = [[max(t[0], lo), v[0]]]
    for i in range(1, len(v)):
        if v[i] != v[i - 1]:
            out.append([t[i], v[i]])
    out.append([min(t[-1], hi), v[-1]])
    return out


def _analog(df: pl.DataFrame, column: str, scale: float = 1.0) -> list[list[float]]:
    if df.height == 0:
        return []
    stride = max(1, df.height // _MAX_ANALOG_POINTS)
    t = df["t"].to_list()[::stride]
    v = df[column].to_list()[::stride]
    return [[a, (b * scale if b is not None else None)] for a, b in zip(t, v)]


# ---------------------------------------------------------------------------
# public
# ---------------------------------------------------------------------------

#: door -> gear stem, door stem, open-limit column
DOOR_SIGNALS = {
    "NOSE": ("ng", "nose_door_locked_up", "nose_door_open_limit_reached"),
    "RH": ("rh_mlg", "rh_door_locked_up", "rh_door_open_limit"),
    "LH": ("lh_mlg", "lh_door_locked_up", "lh_door_open_limit"),
}


def cycle_signals(derived: Path, lo: float, hi: float) -> dict[str, dict[str, list[list[float]]]]:
    """door -> {gear_uplock, gear_downlock, door_uplock, door_open_limit}."""
    columns = []
    for gear, door, limit in DOOR_SIGNALS.values():
        columns += [f"{gear}_locked_up", f"{gear}_locked_down", door, limit]
    df = _read(derived, "Data-2", columns, lo, hi)

    out: dict[str, dict[str, list[list[float]]]] = {}
    for name, (gear, door, limit) in DOOR_SIGNALS.items():
        out[name] = {
            "gear_uplock": _binary(df, f"{gear}_locked_up", lo, hi),
            "gear_downlock": _binary(df, f"{gear}_locked_down", lo, hi),
            "door_uplock": _binary(df, door, lo, hi),
            "door_open_limit": _binary(df, limit, lo, hi),
        }
    return out


def landing_signals(derived: Path, lo: float, hi: float) -> dict[str, Any]:
    """Wheel speed, ground speed (kts), Nx, chute select, vertical velocity."""
    wheels = _read(derived, "Data-1", ["wheel_speed_lh", "wheel_speed_rh"], lo, hi)
    if wheels.height:
        wheels = wheels.with_columns(
            (pl.max_horizontal("wheel_speed_lh", "wheel_speed_rh") / KNOTS_TO_MS).alias("wheel_kts")
        )
    chute = _read(derived, "Data-2", ["chute_select"], lo, hi)
    ground = _read(derived, "Data-5", ["ground_speed"], lo, hi)
    nx = _read(derived, "Data-4", ["nx_data"], lo, hi)
    vv = _read(derived, "Data-6", ["ver_lin_velocity"], lo, hi)
    return {
        "wheel_speed": _analog(wheels, "wheel_kts") if wheels.height else [],
        "ground_speed": _analog(ground, "ground_speed"),
        "nx": _analog(nx, "nx_data"),
        "chute_select": _binary(chute, "chute_select", lo, hi),
        "vertical_velocity": _analog(vv, "ver_lin_velocity"),
    }


def seconds_of_day(when: dt.datetime, base_date: dt.date) -> float:
    """A datetime as seconds since midnight of the flight's date."""
    midnight = dt.datetime.combine(base_date, dt.time.min)
    return (when - midnight).total_seconds()
