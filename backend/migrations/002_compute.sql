-- ---------------------------------------------------------------------------
-- 002_compute.sql  —  optional extras for engineering parameter computation.
--
-- THE TABLES ALREADY EXIST. AIRCRAFTS, EVENTS, EVENT_TIMESTAMPS, FLIGHTS,
-- FLIGHT_STATUS, PARAMETERS, RESULTS and UNITS were all created with the D1/D5
-- schema and match what the code expects. Nothing here creates a table.
--
-- Run `python -m scripts.check_db` first. It reports exactly which of the
-- statements below you need, reads the two column types that matter, and lists
-- which sequences are missing. Run only what it names.
--
-- SECTION 1  sequences   — needed before a SECOND analysis worker
-- SECTION 2  indexes     — needed once there are more than a few hundred flights
-- SECTION 3  FLIGHTS.INITIAL_MASS_KG — only if a flight's mass can differ from
--                                       its aircraft's registered mass
-- SECTION 4  what check_db verifies and why those two column types matter
-- ---------------------------------------------------------------------------


-- == SECTION 1 — sequences (OPTIONAL) =======================================
-- Without a sequence the code allocates ids with MAX(id)+1, which is correct
-- but SINGLE WRITER ONLY: two workers would allocate the same block and collide
-- on the primary key.
--
-- EVENT_TIMESTAMPS_SEQ and RESULTS_SEQ already exist, and those are the two
-- that see volume. EVENTS, PARAMETERS and UNITS are only written by
-- `scripts/seed_reference`, which is run by hand and never concurrently, so
-- MAX(id)+1 is genuinely fine for them. Create these only if you want the
-- schema uniform.
--
-- DO NOT write `CREATE SEQUENCE events_seq START WITH 1`. All three tables
-- already hold rows, so a sequence starting at 1 would hand out ids that exist
-- and every insert would fail on the unique constraint. The block below starts
-- each sequence above the current maximum.

DECLARE
  v_next   NUMBER;
  v_exists NUMBER;
  TYPE t_spec IS RECORD (seq VARCHAR2(30), tab VARCHAR2(30), col VARCHAR2(30));
  TYPE t_list IS TABLE OF t_spec;
  v_specs  t_list := t_list(
    t_spec('EVENTS_SEQ',     'EVENTS',     'EVENT_ID'),
    t_spec('PARAMETERS_SEQ', 'PARAMETERS', 'PARAM_ID'),
    t_spec('UNITS_SEQ',      'UNITS',      'UNIT_ID')
  );
BEGIN
  FOR i IN 1 .. v_specs.COUNT LOOP
    SELECT COUNT(*) INTO v_exists
      FROM user_sequences WHERE sequence_name = v_specs(i).seq;

    IF v_exists = 0 THEN
      EXECUTE IMMEDIATE
        'SELECT NVL(MAX(' || v_specs(i).col || '), 0) + 1 FROM ' || v_specs(i).tab
        INTO v_next;

      EXECUTE IMMEDIATE
        'CREATE SEQUENCE ' || v_specs(i).seq ||
        ' START WITH ' || v_next || ' INCREMENT BY 1 NOCACHE';

      DBMS_OUTPUT.PUT_LINE(v_specs(i).seq || ' created, starting at ' || v_next);
    ELSE
      DBMS_OUTPUT.PUT_LINE(v_specs(i).seq || ' already exists, left alone');
    END IF;
  END LOOP;
END;
/

-- The same trap applies to the two that already exist. If EVENT_TIMESTAMPS or
-- RESULTS already hold rows from an earlier run, confirm their sequences are
-- ahead of the data before relying on them:
--
--   SELECT last_number FROM user_sequences WHERE sequence_name = 'RESULTS_SEQ';
--   SELECT NVL(MAX(result_id), 0) FROM results;
--
-- The first must exceed the second.


-- == SECTION 2 — indexes ====================================================
-- EVENT_TIMESTAMPS gains roughly 40-80 rows per flight per family, so these
-- matter once the archive grows. The last one is the analysis worker's claim,
-- which otherwise scans FLIGHT_STATUS on every 5-second poll.

CREATE INDEX et_flight_ix ON event_timestamps (flight_id, event_id);
CREATE INDEX et_seq_ix    ON event_timestamps (flight_id, occur_seq);
CREATE INDEX rs_flight_ix ON results (flight_id, param_id);
CREATE INDEX fs_status_ix ON flight_status (status);


-- == SECTION 3 — optional column ============================================
-- D5 lists "Initial mass (kg)" on FLIGHTS. The current FLIGHTS table does not
-- have it, and the code already falls back to AIRCRAFTS.AIRCRAFT_MASS_KG, which
-- is the usual case. Add this only if one flight's starting mass can differ
-- from its aircraft's registered mass (external stores, ballast).

ALTER TABLE flights ADD (initial_mass_kg NUMBER);


-- == SECTION 4 — what check_db verifies =====================================
-- Two column types decide whether the inserts work, and neither can be guessed
-- from a column list. `python -m scripts.check_db` reads both and tells you what
-- to do; this section records why they matter.
--
-- EVENT_TIMESTAMPS.DATE_TIME must be TIMESTAMP, not DATE.
--   An Oracle DATE has second resolution. The TIME column in the source files
--   carries microseconds ('08:39:40:241398'), and the code binds
--   DB_TYPE_TIMESTAMP to preserve them. Against a DATE column every value would
--   silently truncate to .000000 and nothing would raise.
--
--   SELECT data_type FROM user_tab_columns
--    WHERE table_name = 'EVENT_TIMESTAMPS' AND column_name = 'DATE_TIME';
--
-- RESULTS.START_EVENT_TIMESTAMP decides RESULTS_LINK_MODE in .env.
--   NUMBER       -> RESULTS_LINK_MODE=id         (holds EVENT_TIMESTAMP_ID,
--                                                 which is what D5 specifies)
--   TIMESTAMP    -> RESULTS_LINK_MODE=timestamp  (holds the datetime itself)
--   Getting it wrong is an ORA-00932 on the first insert, not silent
--   corruption, so it fails loudly — but check it before a long run.
--
--   SELECT data_type FROM user_tab_columns
--    WHERE table_name = 'RESULTS' AND column_name = 'START_EVENT_TIMESTAMP';
--
-- RESULTS.STATUS is written as 1 (Complete) / 0 (Incomplete).
--
-- PARAMETERS.UNIT_ID references UNITS. `scripts/seed_reference` resolves each
-- family's declared unit name to a UNIT_ID and inserts any that are missing.
-- The families currently declare: s, kg, m, g, knots, MILIRAD, LSW.
-- The last two come straight from the source files' own metadata and are not
-- SI units — see decision 0002.

COMMIT;
