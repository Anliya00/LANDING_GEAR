-- ---------------------------------------------------------------------------
-- 003_d8_rollback.sql  —  put the database back to the pre-D8 structure.
--
-- Undoes the D8 changes: removes ANCHOR_TIMESTAMP_ID from EVENT_TIMESTAMPS and
-- RESULTS, removes FLIGHTS.INITIAL_FUEL_LOADED, and restores RESULTS.STATUS,
-- START_EVENT_TIMESTAMP and END_EVENT_TIMESTAMP.
--
-- ASSUMPTIONS (check against your original DDL before running):
--   START_/END_EVENT_TIMESTAMP were TIMESTAMP(6)  (.env RESULTS_LINK_MODE=timestamp)
--   STATUS was NUMBER(1): 1 = complete, 0 = incomplete
--
-- Computed rows are deleted (they cannot be converted back). Afterwards:
--   1. python scripts/seed_reference.py   (restores the INITIAL_FUEL_LOADED parameter)
--   2. set every flight back to ANALYSIS PENDING so it is recomputed
-- Run once as the schema owner, with the pre-D8 backend code in place.
-- ---------------------------------------------------------------------------

DELETE FROM results;
DELETE FROM event_timestamps;

ALTER TABLE results ADD (
  start_event_timestamp TIMESTAMP(6),
  end_event_timestamp   TIMESTAMP(6),
  status                NUMBER(1)
);

ALTER TABLE results DROP CONSTRAINT fk_results_anchor;
DROP INDEX ix_results_anchor;
ALTER TABLE results DROP COLUMN anchor_timestamp_id;

ALTER TABLE event_timestamps DROP CONSTRAINT fk_evts_anchor;
DROP INDEX ix_evts_anchor;
ALTER TABLE event_timestamps DROP COLUMN anchor_timestamp_id;

ALTER TABLE flights DROP COLUMN initial_fuel_loaded;

COMMIT;
