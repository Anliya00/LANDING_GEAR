"""Where flight folders live under DATA_DIR.

Two layouts exist and both are accepted:

    <data_dir>/AC<n>/AC<n>_<NNN>_<ddmmyyyy>/{Raw,Derived}              (flat)
    <data_dir>/Aircrafts/AC<n>/AC<n>_<NNN>_<ddmmyyyy>/{Raw,Derived}    (grouped)

The folder scan, the ingestion worker and the analysis step all read this one
definition, so they cannot disagree about where a flight is.
"""

from __future__ import annotations

from pathlib import Path


def aircraft_bases(data_dir: Path) -> list[Path]:
    """Folders that directly contain AC<n> folders, grouped layout first."""
    return [data_dir / "Aircrafts", data_dir]


def iter_aircraft_dirs(data_dir: Path) -> list[Path]:
    """Every AC<n> folder, in either layout. A name found twice is listed once."""
    seen: set[str] = set()
    found: list[Path] = []
    for base in aircraft_bases(data_dir):
        if not base.is_dir():
            continue
        for entry in sorted(base.iterdir()):
            name = entry.name.upper()
            if (
                entry.is_dir()
                and name.startswith("AC")
                and name[2:].isdigit()
                and name not in seen
            ):
                seen.add(name)
                found.append(entry)
    return found


def find_flight_dir(data_dir: Path, aircraft_number: int, flight_number: int) -> Path | None:
    """The AC<n>_<NNN>_* folder for one flight, or None."""
    aircraft = f"AC{aircraft_number}"
    prefix = f"{aircraft}_{int(flight_number):03d}_"
    for base in aircraft_bases(data_dir):
        parent = base / aircraft
        if not parent.is_dir():
            continue
        for folder in sorted(parent.iterdir()):
            if folder.is_dir() and folder.name.startswith(prefix):
                return folder
    return None
