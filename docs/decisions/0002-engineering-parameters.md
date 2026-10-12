# 0002 — Engineering parameter computation

Status: accepted · Date: 2026-10-12 · Implements: PoC_Requirements-D5

## Context

D5 defines 26 engineering parameters across nine calculation groups, to be computed
from the six Parquet files a flight produces and written to EVENT_TIMESTAMPS and
RESULTS. It requires the work to happen asynchronously, after upload, without the
user waiting for it.

Ingestion already existed: `services/worker.py` converts `.xlsx` to Parquet as a
background asyncio task, driven by a VARCHAR status on a single FLIGHT_STATUS row
per flight. Whatever computes parameters has to live beside that, not replace it.

The data is real and imperfect. Three sample flights exist (AC1–AC3); one of them
cannot be read at all, and the other two both contain signal patterns that the
requirements, read literally, resolve incorrectly. Several decisions below exist
only because of what the real files turned out to contain.

## Decisions

### A seam between calculation and persistence, enforced by imports

`app/compute/` imports `polars` and never `oracledb`. `app/db/results_repo.py`
imports `oracledb` and never `polars`. They meet only over the dataclasses in
`app/compute/models.py`.

This is not decoration. It means every formula can be tested against a synthetic
Parquet folder with no database present — `scripts/run_compute --detect-only` does
exactly that and needs no credentials — and it means the delete-then-insert that
makes a re-run idempotent lives in one place rather than in each calculation.

### A separate analysis worker task, not a second stage in the ingestion loop

D5 says "one or more background workers shall consume tasks from this queue
independently of the upload request". A second stage inside `ingestion_worker`
would have been simpler, but a flight that takes a minute to compute would then
delay the next flight's Parquet conversion.

`services/analysis_worker.py` is its own `asyncio.create_task` in the lifespan. The
compute is blocking CPU and file work, so it runs through `asyncio.to_thread` — the
same thing the ingestion worker does for conversion, and for the same reason: without
it the event loop, and the whole API with it, would stall.

### The status column is the queue

No broker. A flight moves to `ANALYSIS PENDING` and the worker's poll finds it. The
claim is `FOR UPDATE ... SKIP LOCKED`, copied from the ingestion worker so the two
behave identically and a second worker can be added without changing anything.

### FLIGHT_STATUS is left exactly as it is

One row per flight, VARCHAR status, updated in place. D5 describes status as
"maintained in a separate DB table, with timestamp", which reads like append-only
history, and `flight_repo.list_all` already queries it with `ROW_NUMBER() OVER
(ORDER BY DATE_TIME DESC)` as though it were. Changing it was considered and
rejected for now: it would touch ingestion, which works.

Four values are added to the existing vocabulary: `ANALYSIS PENDING`, `ANALYZING`,
`ANALYSIS COMPLETE`, `ANALYSIS FAILED`. `ANALYZING` is not in D5's list of five; it
exists because a worker needs somewhere to park a flight it has claimed, or two
workers would both take the same one.

### A shared phase layer, computed once per flight

Six of the nine groups need to know when the aircraft left the ground and when it
came back. `compute/phases.py` resolves take-offs, landings, touchdowns and the two
roll windows once, and every family reads the same answer.

Families declare `NEEDS_PHASES`. Retraction and extension do not need it, so they run
against Data-1 and Data-2 alone and the phase pass never happens — a flight missing
its WOW columns can still have its gear cycles computed.

### Retraction and extension share one engine

They differ only in the anchor and in two of the six chain steps. `families/_cycles.py`
holds the walk, the window, the debounce and every completion rule; each family is a
`CycleSpec` naming what differs. The alternative was a second copy of 150 lines that
would drift.

### Three guards that are not in D5

Each was added because the real data produced a wrong answer without it. Each is a
named constant with the measurement that set it recorded beside it. **All three need
confirming with the requirements author.**

**`phases.CLIMB_PEAK_RATIO = 0.95`.** A take-off is anchored on WOW_NOSE 1→0. AC2's
nose gear bounces during its landing rollout, producing five such edges; read
literally, each is a take-off. Worse, treating them as take-offs truncated the landing
search region and lost the real landing entirely.

D5 already contains the discriminator — it describes the take-off roll as a
"continuous climb to lift-off". A genuine take-off is still accelerating when the nose
comes up; a rollout bounce has already peaked and is decaying. Measured: real take-offs
sit at 0.997 and 1.000 of their peak speed at the anchor, the bounce at 0.915.

**`phases.LANDING_MIN_PEAK_MS = 15.0`.** A landing ends at "the first time wheel speed
decays to ≤10 kts". Low-speed taxi crosses that line too, and registered as extra
landings on both AC2 and AC3. A landing now has to spin the wheels past 15 m/s.
Measured: real landings peak at 75–78 m/s, taxi blips at 5–6.5 m/s.

**`mass.MAX_FUEL_GAP_S = 10.0`.** D5 says to read fuel at "the sample nearest to
anchor_ts". AC3's REMN_FF recording stops 403 s before its landing, so the nearest
sample is the last row of the file: the landing mass computed cleanly, looked
plausible, and was measured from stale data with nothing to indicate it. Beyond this
gap the result is Incomplete with the reason recorded instead.

### Decay requires something to decay from

"First time wheel speed decays to ≤10 kts after start" read literally matches the
sample right after touchdown, where the wheels have not spun up yet. The search waits
until the speed has exceeded the threshold before looking for the fall back through it.

### Timestamps never pass through float arithmetic

Each `Occurrence` carries `source_time`, the original `'HH:MM:SS:ffffff'` text from the
Parquet. `timebase.to_datetime` parses it as four integers. The seconds-as-float value
is used only to order events and to supply the day offset when a flight crosses
midnight. `setinputsizes(DB_TYPE_TIMESTAMP)` stops oracledb binding it as an Oracle
DATE and silently truncating the microseconds.

### Unselected occurrences are stored

D5 is explicit: every detected transition goes to EVENT_TIMESTAMPS, and `occur_seq` is
populated only for the one a chain selected. The rest carry NULL. That is what lets
anyone later answer "why did this cycle come out Incomplete".

### The re-run delete is scoped to one family

`results_repo.delete_family` removes only the rows the same family wrote, matched on
its own EVENT_IDs and PARAM_IDs, then inserts. This is what makes requeuing a flight a
crashed worker left half-done safe. (An earlier PoC script deleted every
EVENT_TIMESTAMPS row for the flight regardless of family — harmless when only one
family existed, not now.)

Caveat: if two families ever declare the *same* event, re-running one clears the
other's rows for it. Nothing does today. The fix then is a FAMILY column on
EVENT_TIMESTAMPS, not a wider delete.

## Discrepancies found in D5

- **§3.5.7 says GROUND_SPEED comes from Data-1.** It exists only in Data-5, confirmed
  against the real Parquet files, and §3.5.8 names Data-5 for the same column. The code
  reads Data-5.
- **NX_DATA's unit is recorded as MILIRAD**, an angle, not an acceleration.
  **VER_LIN_VELOCITY is LSW**, which is not a velocity unit. Both are carried through
  unconverted. Confirm before anyone reads those numbers as g or ft/s.
- **The mass formula is now unambiguous** and resolves the question that stalled it in
  the earlier PoC: fuel *used* is first REMN_FF minus REMN_FF at the event, so landing
  mass comes out below take-off mass, as it must.

## Deferred

- Automatic hand-off from ingestion: `services/worker.py` still ends at `UPLOAD
  COMPLETE`. One line setting `ANALYSIS PENDING` closes the loop; until then analysis is
  triggered by `POST /flights/{id}/analysis`.
- AC1 cannot be analysed: `TIME_BACKWARDS_JUMP`, three corrupted timestamps in Data-1.
  Needs either a tolerance rule or manual row exclusion — an operator's decision, not a
  code one.
- The anchor debounce (1.0 s) is inherited from the earlier PoC scripts. D5 says anchors
  are debounced but gives no value. Someone who knows the lever's bounce characteristics
  should set it.
- `FLIGHTS.INITIAL_MASS_KG` is optional. The code prefers it and falls back to
  `AIRCRAFTS.AIRCRAFT_MASS_KG`, which is the usual case.
- Sequences. Without `event_timestamps_seq` and `results_seq` the id allocation falls
  back to `MAX(id)+1`, which is single-writer only. Create them before running a second
  analysis worker.

## Consequences

Adding a parameter family is three steps: write `families/<name>.py` exposing the
module contract, add it to `_MODULES` in `registry.py`, re-run
`scripts/seed_reference`. The worker, the API, the repositories and the CLI all read the
registry and none of them changes.

Every value in RESULTS points at the two EVENT_TIMESTAMPS rows it was measured between,
so a number can always be traced back to the moment in the telemetry it came from.

A flight can be recomputed at any time by re-queuing it, including after a formula
changes, because each family replaces its own rows rather than adding to them.
