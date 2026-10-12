"""Seed EVENTS and PARAMETERS from the family registry.

    python -m scripts.seed_reference              # insert what is missing
    python -m scripts.seed_reference --dry-run    # show what would change

Idempotent: every write is a MERGE, so running it twice changes nothing and
running it after adding a family inserts only that family's new rows. Run it
once after migration 002, and again whenever a family is added or renamed.

Ids come from a sequence when one exists, else MAX(id)+1.
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.compute import registry
from app.db import reference_repo, results_repo
from app.db.pool import close_pool, connection, init_pool

log = logging.getLogger("seed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--families", help="comma separated; default = all registered")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")

    families = [f.strip() for f in args.families.split(",")] if args.families else None
    event_keys = registry.all_event_keys(families)
    param_definitions = registry.all_param_definitions(families)

    init_pool()
    try:
        with connection() as conn:
            cur = conn.cursor()
            missing_events, missing_params = reference_repo.missing_reference(
                conn, event_keys, set(param_definitions)
            )

            if not missing_events and not missing_params:
                print("nothing to do — EVENTS and PARAMETERS are already complete")
                return 0

            print(f"EVENTS to insert:     {len(missing_events)}")
            for key in missing_events:
                print(f"  {key.event_name:<46} source={key.source_file}")
            print(f"PARAMETERS to insert: {len(missing_params)}")
            for name in missing_params:
                unit, description = param_definitions[name]
                print(f"  {name:<34} [{unit}]  {description}")

            if args.dry_run:
                conn.rollback()
                print("\ndry run — nothing written")
                return 0

            event_ids = results_repo.allocate(
                cur, "events", "event_id", "events_seq", len(missing_events)
            )
            for new_id, key in zip(event_ids, missing_events):
                try:
                    reference_repo.upsert_event(conn, new_id, key)
                except Exception as exc:
                    raise RuntimeError(
                        f"EVENTS insert failed for {key} (event_id={new_id}, "
                        f"source={key.source_file}): {exc}"
                    ) from exc

            param_ids = results_repo.allocate(
                cur, "parameters", "param_id", "parameters_seq", len(missing_params)
            )
            for new_id, name in zip(param_ids, missing_params):
                unit, description = param_definitions[name]
                try:
                    reference_repo.upsert_param(conn, new_id, name, unit, description)
                except Exception as exc:
                    raise RuntimeError(
                        f"PARAMETERS insert failed for {name!r} (param_id={new_id}, "
                        f"unit={unit!r} -> {reference_repo.canonical_unit(unit)!r}): {exc}"
                    ) from exc

        print(
            f"\ninserted {len(missing_events)} event(s) "
            f"and {len(missing_params)} parameter(s)"
        )
    except Exception as exc:  # noqa: BLE001
        print(f"FAILED: {exc}", file=sys.stderr)
        return 2
    finally:
        close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
