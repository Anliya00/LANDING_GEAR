-- ---------------------------------------------------------------------------
-- 003_d8_anchor.sql  —  PoC Requirements D8 data model.
--
--   EVENT_TIMESTAMPS  + OCCUR_SEQ already present, + ANCHOR_TIMESTAMP_ID
--   RESULTS           = (RESULT_ID, FLIGHT_ID, PARAM_ID, PARAM_VAL,
--                        OCCUR_SEQ, ANCHOR_TIMESTAMP_ID)
--                       STATUS, START_EVENT_TIMESTAMP, END_EVENT_TIMESTAMP dropped
--   FLIGHTS           + INITIAL_FUEL_LOADED (no longer a RESULTS parameter)
--
-- A NULL PARAM_VAL means "not computable"; a cycle is complete when it has no
-- NULL rows. The events behind a result are found by joining on the anchor.
--
-- DESTRUCTIVE: all existing RESULTS and computed EVENT_TIMESTAMPS rows are
-- deleted because they cannot be mapped to anchors. After running this, set
-- every flight back to ANALYSIS PENDING so the worker recomputes it.
-- Run once, as the schema owner, then restart the backend.
-- ---------------------------------------------------------------------------

-- 1. wipe computed data (old rows have no anchors)
DELETE FROM results;
DELETE FROM event_timestamps;

-- 2. new columns
ALTER TABLE event_timestamps ADD (anchor_timestamp_id NUMBER);
ALTER TABLE results          ADD (anchor_timestamp_id NUMBER);
ALTER TABLE flights          ADD (initial_fuel_loaded NUMBER);

-- 3. self-reference: an anchor row points at itself
ALTER TABLE event_timestamps ADD CONSTRAINT fk_evts_anchor
  FOREIGN KEY (anchor_timestamp_id) REFERENCES event_timestamps (event_timestamp_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE results ADD CONSTRAINT fk_results_anchor
  FOREIGN KEY (anchor_timestamp_id) REFERENCES event_timestamps (event_timestamp_id);

CREATE INDEX ix_evts_anchor    ON event_timestamps (anchor_timestamp_id);
CREATE INDEX ix_results_anchor ON results (anchor_timestamp_id);

-- 4. drop the columns D8 removes
ALTER TABLE results DROP COLUMN start_event_timestamp;
ALTER TABLE results DROP COLUMN end_event_timestamp;
ALTER TABLE results DROP COLUMN status;

-- 5. INITIAL_FUEL_LOADED lives on FLIGHTS now
DELETE FROM parameters WHERE UPPER(param_name) = 'INITIAL_FUEL_LOADED';

COMMIT;

-- 6. recompute everything: set each flight back to ANALYSIS PENDING
--    (insert a new FLIGHT_STATUS row per flight with the pending status code
--     from app/core/status.py).
