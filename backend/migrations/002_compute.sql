-- ---------------------------------------------------------------------------
-- 002_compute.sql  —  the four tables engineering parameter computation needs.
--
-- Run as the SFTAD schema owner.
--
-- This does NOT touch AIRCRAFTS, FLIGHTS or FLIGHT_STATUS beyond one optional
-- column. The status model stays exactly as the ingestion side built it: one
-- FLIGHT_STATUS row per flight, a VARCHAR STATUS updated in place. The analysis
-- stage simply writes four more values into it:
--
--     ANALYSIS PENDING / ANALYZING / ANALYSIS COMPLETE / ANALYSIS FAILED
--
-- Run `python -m scripts.check_db` first — it reports which of the statements
-- below you actually need.
--
-- SECTION 1  reference tables   EVENTS, PARAMETERS
-- SECTION 2  per-flight tables  EVENT_TIMESTAMPS, RESULTS
-- SECTION 3  optional column on FLIGHTS
-- SECTION 4  sequences
-- SECTION 5  indexes
-- ---------------------------------------------------------------------------


-- == SECTION 1 — reference ==================================================

CREATE TABLE events (
  event_id           NUMBER        PRIMARY KEY,
  event_name         VARCHAR2(120) NOT NULL,   -- 'UC_LEVER_SEL_UP 0->1'
  event_column_name  VARCHAR2(80)  NOT NULL,   -- 'UC_LEVER_SEL_UP'
  transition         NUMBER(1)     NOT NULL,   -- 1 = 0->1, 0 = 1->0
  source_file        VARCHAR2(16),             -- 'Data-1'
  CONSTRAINT events_uq UNIQUE (event_column_name, transition),
  CONSTRAINT events_transition_ck CHECK (transition IN (0, 1))
);

CREATE TABLE parameters (
  param_id     NUMBER        PRIMARY KEY,
  param_name   VARCHAR2(80)  NOT NULL,
  description  VARCHAR2(400),
  unit         VARCHAR2(16),
  CONSTRAINT parameters_uq UNIQUE (param_name)
);


-- == SECTION 2 — per-flight =================================================

-- Every detected transition, whether a chain selected it or not. OCCUR_SEQ
-- carries the cycle number for the occurrence actually selected, NULL
-- otherwise — the requirements ask for the unselected ones to be kept for
-- traceability.
--
-- DATE_TIME must be TIMESTAMP, not DATE. An Oracle DATE has second resolution
-- and the TIME column in the source files carries microseconds.
CREATE TABLE event_timestamps (
  event_timestamp_id  NUMBER       PRIMARY KEY,
  event_id            NUMBER       NOT NULL,
  flight_id           NUMBER       NOT NULL,
  date_time           TIMESTAMP(6) NOT NULL,
  occur_seq           NUMBER,
  CONSTRAINT et_event_fk  FOREIGN KEY (event_id)  REFERENCES events (event_id),
  CONSTRAINT et_flight_fk FOREIGN KEY (flight_id) REFERENCES flights (flight_id)
);

-- START/END_EVENT_TIMESTAMP hold EVENT_TIMESTAMP_ID, which is what the
-- requirements specify ("Start Event Timestamp Id"). If you would rather store
-- the datetimes themselves, declare both columns TIMESTAMP(6) instead and set
-- RESULTS_LINK_MODE=timestamp in .env — scripts/check_db.py reads the column
-- type and tells you which value the setting needs.
CREATE TABLE results (
  result_id              NUMBER       PRIMARY KEY,
  flight_id              NUMBER       NOT NULL,
  param_id               NUMBER       NOT NULL,
  param_val              NUMBER,                -- NULL when status = Incomplete
  occur_seq              NUMBER       NOT NULL,
  start_event_timestamp  NUMBER,
  end_event_timestamp    NUMBER,
  status                 NUMBER(1)    NOT NULL, -- 1 Complete, 0 Incomplete
  CONSTRAINT rs_flight_fk FOREIGN KEY (flight_id) REFERENCES flights (flight_id),
  CONSTRAINT rs_param_fk  FOREIGN KEY (param_id)  REFERENCES parameters (param_id),
  CONSTRAINT rs_start_fk  FOREIGN KEY (start_event_timestamp)
                          REFERENCES event_timestamps (event_timestamp_id),
  CONSTRAINT rs_end_fk    FOREIGN KEY (end_event_timestamp)
                          REFERENCES event_timestamps (event_timestamp_id),
  CONSTRAINT rs_status_ck CHECK (status IN (0, 1)),
  CONSTRAINT rs_uq UNIQUE (flight_id, param_id, occur_seq)
);


-- == SECTION 3 — optional column on FLIGHTS =================================
-- The requirements add "Initial mass (kg)" to FLIGHTS. The code prefers it when
-- present and falls back to AIRCRAFTS.AIRCRAFT_MASS_KG, so this is optional —
-- add it only if a flight's mass can differ from its aircraft's registered one.

ALTER TABLE flights ADD (initial_mass_kg NUMBER);


-- == SECTION 4 — sequences ==================================================
-- Without these the code falls back to MAX(id)+1, which is single-writer only.
-- Create them before you run a second analysis worker.

CREATE SEQUENCE events_seq           START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE parameters_seq       START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE event_timestamps_seq START WITH 1 INCREMENT BY 1 CACHE 100;
CREATE SEQUENCE results_seq          START WITH 1 INCREMENT BY 1 CACHE 100;


-- == SECTION 5 — indexes ====================================================

CREATE INDEX et_flight_ix ON event_timestamps (flight_id, event_id);
CREATE INDEX et_seq_ix    ON event_timestamps (flight_id, occur_seq);
CREATE INDEX rs_flight_ix ON results (flight_id, param_id);

-- The analysis worker's claim.
CREATE INDEX fs_status_ix ON flight_status (status);

COMMIT;
