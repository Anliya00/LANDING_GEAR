#!/usr/bin/env python3
"""
excel_to_parquet.py
===================

Convert an Excel workbook to Parquet, keeping only the columns that carry a
real name and normalising those names.

Columns that are dropped:
  * pandas placeholders        -> "Unnamed: 0", "Unnamed: 12"
  * bare spreadsheet letters   -> "A", "B", "AA"
  * letter-stub headers        -> "A_", "B_3", "AB_"
  * blank / NaN headers
  * columns that are entirely empty (unless --keep-empty is passed)

Columns that are kept are sanitised:
    "WHEEL_SPEED_LH(M/S)"  ->  wheel_speed_lh      (unit "M/S" -> metadata)
    "Touchdown Sink Rate [ft/s]" -> touchdown_sink_rate  (unit "ft/s")
    "NZ-Load Factor"       ->  nz_load_factor

Units stripped from headers are preserved in the Parquet file's schema
metadata under the key ``column_units`` as a JSON object, so nothing is lost.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

EXCEL_FILE = r""
OUTPUT_PATH = r""

PLACEHOLDER_PATTERNS = (
    re.compile(r"^unnamed:?\s*\d+$", re.I),
    re.compile(r"^[a-z]{1,3}$", re.I),
    re.compile(r"^[a-z]{1,3}\d{1,4}$", re.I),
    re.compile(r"^[a-z]{1,3}[_\-.]\d*$", re.I),
    re.compile(r"^col(umn)?[_\-. ]?\d+$", re.I),
    re.compile(r"^\d+$"),
    re.compile(r"^[\W_]*$"),
)

UNIT_RE = re.compile(r"[\(\[\{]\s*([^\)\]\}]+?)\s*[\)\]\}]\s*$")

def is_placeholder(name: object) -> bool:
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return True
    text = str(name).strip()
    if not text:
        return True
    return any(p.match(text) for p in PLACEHOLDER_PATTERNS)

def split_unit(name: str) -> tuple[str, str | None]:
    match = UNIT_RE.search(name)
    if not match:
        return name.strip(), None
    return name[: match.start()].strip(), match.group(1).strip()

def sanitize(name: str) -> str:
    text = str(name).strip()
    text = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", text)
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    if text and text[0].isdigit():
        text = f"c_{text}"
    return text

def dedupe(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out: list[str] = []
    for name in names:
        if name in seen:
            seen[name] += 1
            out.append(f"{name}_{seen[name]}")
        else:
            seen[name] = 1
            out.append(name)
    return out

def clean_frame(
    df: pd.DataFrame,
    *,
    keep_empty: bool = False,
    force_keep: set[str] | None = None,
    force_drop: set[str] | None = None,
    verbose: bool = True,
) -> tuple[pd.DataFrame, dict[str, str], list[str]]:
    force_keep = {n.lower() for n in (force_keep or set())}
    force_drop = {n.lower() for n in (force_drop or set())}

    keep_positions: list[int] = []
    new_names: list[str] = []
    units: dict[str, str] = {}
    dropped: list[str] = []

    for position, original in enumerate(df.columns):
        aliases = {str(original).strip().lower(), sanitize(str(original))}

        if aliases & force_drop:
            dropped.append(f"{original!r} (--drop)")
            continue

        pinned = bool(aliases & force_keep)

        if not pinned and is_placeholder(original):
            dropped.append(f"{original!r} (placeholder header)")
            continue

        if not (keep_empty or pinned) and df.iloc[:, position].isna().all():
            dropped.append(f"{original!r} (no data)")
            continue

        base, unit = split_unit(str(original))
        clean = sanitize(base)
        if not clean:
            dropped.append(f"{original!r} (header sanitises to empty)")
            continue

        keep_positions.append(position)
        new_names.append(clean)
        if unit:
            units[clean] = unit

    new_names = dedupe(new_names)
    units = {
        new: units[old]
        for old, new in zip(
            [sanitize(split_unit(str(df.columns[p]))[0]) for p in keep_positions],
            new_names,
        )
        if old in units
    }

    cleaned = df.iloc[:, keep_positions].copy()
    cleaned.columns = new_names

    if verbose:
        print(f"  kept {len(new_names)} / {len(df.columns)} columns")
        for item in dropped:
            print(f"    dropped {item}")

    return cleaned, units, dropped

def write_parquet(
    df: pd.DataFrame,
    units: dict[str, str],
    destination: Path,
    *,
    compression: str = "zstd",
    source: Path | None = None,
) -> None:
    table = pa.Table.from_pandas(df, preserve_index=False)

    metadata = dict(table.schema.metadata or {})
    if units:
        metadata[b"column_units"] = json.dumps(units).encode()
    if source is not None:
        metadata[b"source_file"] = str(source.name).encode()
    table = table.replace_schema_metadata(metadata)

    destination.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, destination, compression=compression)

def convert(
    excel_path: Path,
    output: Path | None = None,
    *,
    sheet: str | int | None = None,
    all_sheets: bool = False,
    header_row: int = 0,
    keep_empty: bool = False,
    force_keep: set[str] | None = None,
    force_drop: set[str] | None = None,
    compression: str = "zstd",
    preview: int = 0,
    dry_run: bool = False,
) -> list[Path]:
    if not excel_path.is_file():
        raise FileNotFoundError(excel_path)

    sheet_arg: object = None if all_sheets else (0 if sheet is None else sheet)
    frames = pd.read_excel(excel_path, sheet_name=sheet_arg, header=header_row)
    if isinstance(frames, pd.DataFrame):
        frames = {excel_path.stem: frames}

    written: list[Path] = []
    multi = len(frames) > 1

    for sheet_name, raw in frames.items():
        print(f"{excel_path.name} [{sheet_name}]: {len(raw):,} rows")
        cleaned, units, _ = clean_frame(
            raw,
            keep_empty=keep_empty,
            force_keep=force_keep,
            force_drop=force_drop,
        )

        if cleaned.empty or not len(cleaned.columns):
            print("  no named columns survived — nothing written")
            continue

        if output is None:
            destination = excel_path.with_suffix(".parquet")
        elif output.is_dir() or output.suffix == "":
            destination = output / f"{excel_path.stem}.parquet"
        else:
            destination = output
        if multi:
            destination = destination.with_name(
                f"{destination.stem}_{sanitize(str(sheet_name))}.parquet"
            )

        if dry_run:
            continue

        write_parquet(
            cleaned, units, destination,
            compression=compression, source=excel_path,
        )
        written.append(destination)

    return written
