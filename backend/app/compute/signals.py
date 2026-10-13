"""Reading a flight's Derived folder, and finding transitions in it.

One `FlightSignals` per flight. It opens a Parquet file the first time an event
from that file is asked for, and caches both the frame and every edge list it
derives, so a family that re-uses `rh_door_locked_up 1->0` in two places pays
for the scan once.

Families never name a file. They name an `EventKey`, which carries its own
source file, and this class resolves it.
"""

from __future__ import annotations

import logging
from bisect import bisect_left, bisect_right
from pathlib import Path

import polars as pl

from app.compute import timebase
from app.compute.models import EventKey

log = logging.getLogger("compute.signals")

#: Data-1 ... Data-6, as the ingestion step writes them.
FILE_KEYS = tuple(f"Data-{i}" for i in range(1, 7))


class DataDefect(Exception):
    """The flight's data cannot be computed from. Fatal for this flight."""


class FlightSignals:
    def __init__(self, derived: Path, *, strict_monotonic: bool = True) -> None:
        self.derived = Path(derived)
        self.strict_monotonic = strict_monotonic
        self._frames: dict[str, pl.DataFrame] = {}
        self._edges: dict[EventKey, list[tuple[float, str]]] = {}
        self._series: dict[tuple[str, str], tuple[list[float], list[float], list[str]]] = {}
        self.notes: list[str] = []

    # -- files ------------------------------------------------------------

    def require_files(self, file_keys: set[str]) -> None:
        """Fail before any computation if an input file is absent.

        Called once per flight with the union of every registered family's
        files, so a missing Data-5 is reported up front rather than three
        families into the run.
        """
        missing = sorted(
            k for k in file_keys if not (self.derived / f"{k}.parquet").is_file()
        )
        if missing:
            raise DataDefect(
                f"missing in {self.derived}: {', '.join(f'{m}.parquet' for m in missing)}"
            )

    def frame(self, file_key: str) -> pl.DataFrame:
        if file_key in self._frames:
            return self._frames[file_key]

        path = self.derived / f"{file_key}.parquet"
        if not path.is_file():
            raise DataDefect(f"missing {path}")

        df = pl.read_parquet(path)
        df.columns = [c.strip().lower() for c in df.columns]
        df = timebase.add_seconds_column(df)

        back = timebase.backwards_steps(df)
        if back:
            message = f"TIME_BACKWARDS_JUMP: {back} backwards step(s) in {file_key}"
            if self.strict_monotonic:
                raise DataDefect(message)
            log.warning("%s (continuing, strict_monotonic off)", message)
            self.notes.append(message)

        log.debug(
            "%s: %d rows, %.3f..%.3f s, median step %.1f ms",
            file_key, df.height, df["t"][0], df["t"][-1], timebase.median_step_ms(df),
        )
        self._frames[file_key] = df
        return df

    # -- edges ------------------------------------------------------------

    def edges(self, key: EventKey) -> list[tuple[float, str]]:
        """Every (t, source_time) where `key.column` steps to `key.transition`.

        A transition is only counted when the previous sample held the opposite
        value, so a signal that is already 1 at the start of the file does not
        register a spurious rising edge on row 0.
        """
        if key in self._edges:
            return self._edges[key]

        df = self.frame(key.source_file)
        if key.column not in df.columns:
            raise DataDefect(
                f"{key.source_file} has no column '{key.column}'. "
                f"Columns: {', '.join(c for c in df.columns if c != 't')}"
            )

        previous = pl.col(key.column).shift(1)
        hits = df.filter(
            (pl.col(key.column) == key.transition)
            & (previous == 1 - key.transition)
        )
        found = list(zip(hits["t"].to_list(), hits[timebase.TIME_COLUMN].to_list()))
        self._edges[key] = found
        return found

    def edge_times(self, key: EventKey) -> list[float]:
        return [t for t, _ in self.edges(key)]

    # -- value series ------------------------------------------------------
    #
    # Everything below exists for the families the D5 requirements added. The
    # cycle families only ever ask "when did this bit flip"; mass, sink rate,
    # Nx, Nz, chute speed and roll distance all need to read a real number at
    # or across a moment in time.

    def series(self, file_key: str, column: str) -> tuple[list[float], list[float], list[str]]:
        """(times, values, source_time strings) for one column. Cached."""
        cache_key = (file_key, column)
        if cache_key in self._series:
            return self._series[cache_key]

        df = self.frame(file_key)
        if column not in df.columns:
            raise DataDefect(
                f"{file_key} has no column '{column}'. "
                f"Columns: {', '.join(c for c in df.columns if c != 't')}"
            )
        found = (
            df["t"].to_list(),
            [float(v) if v is not None else float("nan") for v in df[column].to_list()],
            df[timebase.TIME_COLUMN].to_list(),
        )
        self._series[cache_key] = found
        return found

    def nearest(self, file_key: str, column: str, at: float) -> tuple[float, float, str] | None:
        """The sample closest in time to `at`, before or after.

        The requirements phrase this as: "Reading a value from another file:
        take the sample closest in time to the event, whether it is just before
        or just after." Ties go to the earlier sample, as the doc specifies.

        Returns (t, value, source_time), or None if the column is empty.
        """
        times, values, raw = self.series(file_key, column)
        if not times:
            return None

        index = bisect_left(times, at)
        if index == 0:
            best = 0
        elif index >= len(times):
            best = len(times) - 1
        else:
            before, after = index - 1, index
            # <= keeps the earlier sample when the two are equally close.
            best = before if (at - times[before]) <= (times[after] - at) else after
        return (times[best], values[best], raw[best])

    def between(
        self, file_key: str, column: str, start: float, end: float
    ) -> tuple[list[float], list[float]]:
        """Every sample with start <= t <= end, as (times, values).

        Inclusive at both ends: a window defined by two events should contain
        the samples at those events.
        """
        times, values, _ = self.series(file_key, column)
        lo = bisect_left(times, start)
        hi = bisect_right(times, end)
        return (times[lo:hi], values[lo:hi])

    def first_leaving_zero(
        self, file_key: str, column: str, after: float, before: float
    ) -> tuple[float, str] | None:
        """First sample in (after, before) that is non-zero with a zero before it.

        This is the "wheel speed rising from 0" the requirements use as a
        landing and touchdown candidate.
        """
        times, values, raw = self.series(file_key, column)
        for i in range(max(1, bisect_right(times, after)), len(times)):
            if times[i] >= before:
                break
            if values[i] > 0 and values[i - 1] == 0:
                return (times[i], raw[i])
        return None

    def last_zero_before(
        self, file_key: str, columns: list[str], anchor: float
    ) -> tuple[float, str] | None:
        """Walking back from `anchor`, the last sample where every column is 0.

        The requirements define the start of a take-off roll as "the last
        0-value sample before the continuous climb to lift-off". Walking
        backwards and stopping at the first zero is exactly that, provided the
        climb really is continuous — which is what "continuous" asserts.
        """
        series = [self.series(file_key, c) for c in columns]
        times = series[0][0]
        index = bisect_left(times, anchor)
        for i in range(min(index, len(times)) - 1, -1, -1):
            if all(s[1][i] == 0 for s in series):
                return (times[i], series[0][2][i])
        return None

    def first_decay_below(
        self,
        file_key: str,
        columns: list[str],
        threshold: float,
        after: float,
        before: float | None = None,
    ) -> tuple[float, str] | None:
        """First sample at or below `threshold` that follows a sample above it.

        The requirements say the landing window ends at "the first time wheel
        speed decays to <=10 kts". Read literally that would match the sample
        right after touchdown, where the wheels have not spun up yet. A decay
        implies something to decay from, so this waits until the speed has
        exceeded the threshold before looking for the fall back through it.
        """
        series = [self.series(file_key, c) for c in columns]
        times = series[0][0]
        risen = False
        for i in range(bisect_right(times, after), len(times)):
            if before is not None and times[i] > before:
                break
            fastest = max(s[1][i] for s in series)
            if fastest > threshold:
                risen = True
            elif risen:
                return (times[i], series[0][2][i])
        return None

    def describe_edges(self, keys: set[EventKey]) -> list[str]:
        """Diagnostic lines for the dry-run CLI."""
        return [
            f"  {key}: {len(self.edges(key))} edge(s)"
            for key in sorted(keys, key=lambda k: (k.column, k.transition))
        ]
