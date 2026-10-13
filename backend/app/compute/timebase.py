"""The TIME column: text -> seconds, and back to an exact datetime.

The telemetry carries a clock, not a date. Every file's TIME is
'HH:MM:SS:ffffff' since midnight, so two things have to be handled:

  * a flight that crosses midnight makes the clock jump backwards by ~24 h,
    which is a wrap and not a defect;
  * the calendar date comes from FLIGHTS.FLIGHT_DATE_TIME, never from the file.
"""

from __future__ import annotations

import datetime as dt

import polars as pl

SECONDS_PER_DAY = 86_400.0
_WRAP_THRESHOLD_S = 43_200.0  # a backwards step larger than 12 h is a wrap

TIME_COLUMN = "time"
SECONDS_COLUMN = "t"


class TimeFormatError(ValueError):
    """The TIME column is not 'HH:MM:SS:ffffff'."""


def add_seconds_column(df: pl.DataFrame) -> pl.DataFrame:
    """Add a float `t` column: seconds since midnight, midnight-unwrapped.

    '08:17:28:082038' -> 29848.082038
    """
    if TIME_COLUMN not in df.columns:
        raise TimeFormatError(
            f"no '{TIME_COLUMN}' column; found {df.columns[:8]}"
        )

    parts = pl.col(TIME_COLUMN).str.split(":")
    df = df.with_columns(
        (
            parts.list.get(0).cast(pl.Int64) * 3600
            + parts.list.get(1).cast(pl.Int64) * 60
            + parts.list.get(2).cast(pl.Int64)
            + parts.list.get(3).cast(pl.Float64) / 1_000_000
        ).alias(SECONDS_COLUMN)
    )
    return df.with_columns(pl.Series(SECONDS_COLUMN, _unwrap_midnight(df[SECONDS_COLUMN].to_list())))


def _unwrap_midnight(values: list[float]) -> list[float]:
    """Make a wall clock monotonic by adding a day at each rollover."""
    out: list[float] = []
    offset = 0.0
    for i, v in enumerate(values):
        if i and (v + offset) < out[-1] - _WRAP_THRESHOLD_S:
            offset += SECONDS_PER_DAY
        out.append(v + offset)
    return out


def backwards_steps(df: pl.DataFrame) -> int:
    """How many times `t` goes backwards after unwrapping.

    Any non-zero count is a genuine data defect (AC1's three corrupted rows are
    the known example), not a midnight wrap — `_unwrap_midnight` has already
    absorbed those.
    """
    diffs = df[SECONDS_COLUMN].diff().drop_nulls()
    return int((diffs < 0).sum())


def median_step_ms(df: pl.DataFrame) -> float:
    diffs = df[SECONDS_COLUMN].diff().drop_nulls()
    return float(diffs.median() or 0.0) * 1000.0


def to_datetime(base_date: dt.date, source_time: str, t: float) -> dt.datetime:
    """Exact naive datetime for one occurrence.

    The four fields are parsed as integers out of the original text, so no float
    arithmetic touches the stored value. `t` is used only for the day offset
    when a flight crosses midnight.
    """
    try:
        hour, minute, second, micro = (int(x) for x in source_time.split(":"))
    except (ValueError, AttributeError) as exc:
        raise TimeFormatError(f"cannot parse TIME {source_time!r}") from exc

    return dt.datetime.combine(
        base_date, dt.time(hour, minute, second, micro)
    ) + dt.timedelta(days=int(t // SECONDS_PER_DAY))
