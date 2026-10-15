from __future__ import annotations

from typing import Any
import oracledb
from app.db.pool import rows_to_dicts, row_to_dict

def list_all(conn: oracledb.Connection) -> list[dict[str, Any]]:
    cur = conn.cursor()
    # Left join AIRCRAFTS to get aircraft_number and configured aircraft_mass_kg
    # Left join FLIGHT_STATUS to get the latest status
    cur.execute(
        """
        SELECT f.FLIGHT_ID, f.AIRCRAFT_ID, a.AIRCRAFT_NUMBER, f.FLIGHT_NUMBER, f.FLIGHT_DATE_TIME,
               a.AIRCRAFT_MASS_KG AS CONFIGURED_MASS_KG,
               f.INITIAL_FUEL_LOADED_KG AS INITIAL_FUEL_KG,
               CASE 
                 WHEN a.AIRCRAFT_MASS_KG IS NOT NULL AND f.INITIAL_FUEL_LOADED_KG IS NOT NULL 
                 THEN a.AIRCRAFT_MASS_KG + f.INITIAL_FUEL_LOADED_KG
                 ELSE COALESCE(a.AIRCRAFT_MASS_KG, f.INITIAL_FUEL_LOADED_KG)
               END AS INITIAL_MASS_KG,
               f.UPLOAD_START_TIME, f.UPLOAD_END_TIME,
               fs.STATUS, fs.REMARKS as ERROR_MESSAGE
          FROM FLIGHTS f
          LEFT JOIN AIRCRAFTS a ON f.AIRCRAFT_ID = a.AIRCRAFT_ID
          LEFT JOIN (
              SELECT FLIGHT_ID, STATUS, REMARKS,
                     ROW_NUMBER() OVER(PARTITION BY FLIGHT_ID ORDER BY DATE_TIME DESC) as rn
                FROM FLIGHT_STATUS
          ) fs ON f.FLIGHT_ID = fs.FLIGHT_ID AND fs.rn = 1
         ORDER BY f.FLIGHT_DATE_TIME DESC NULLS LAST, f.FLIGHT_ID DESC
        """
    )
    return rows_to_dicts(cur)


def get_flight_by_id(conn: oracledb.Connection, flight_id: int) -> dict[str, Any] | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT f.FLIGHT_ID, f.AIRCRAFT_ID, a.AIRCRAFT_NUMBER, f.FLIGHT_NUMBER, f.FLIGHT_DATE_TIME,
               a.AIRCRAFT_MASS_KG AS CONFIGURED_MASS_KG,
               f.INITIAL_FUEL_LOADED_KG AS INITIAL_FUEL_KG,
               CASE 
                 WHEN a.AIRCRAFT_MASS_KG IS NOT NULL AND f.INITIAL_FUEL_LOADED_KG IS NOT NULL 
                 THEN a.AIRCRAFT_MASS_KG + f.INITIAL_FUEL_LOADED_KG
                 ELSE COALESCE(a.AIRCRAFT_MASS_KG, f.INITIAL_FUEL_LOADED_KG)
               END AS INITIAL_MASS_KG,
               f.UPLOAD_START_TIME, f.UPLOAD_END_TIME,
               fs.STATUS, fs.REMARKS as ERROR_MESSAGE
          FROM FLIGHTS f
          LEFT JOIN AIRCRAFTS a ON f.AIRCRAFT_ID = a.AIRCRAFT_ID
          LEFT JOIN (
              SELECT FLIGHT_ID, STATUS, REMARKS,
                     ROW_NUMBER() OVER(PARTITION BY FLIGHT_ID ORDER BY DATE_TIME DESC) as rn
                FROM FLIGHT_STATUS
          ) fs ON f.FLIGHT_ID = fs.FLIGHT_ID AND fs.rn = 1
         WHERE f.FLIGHT_ID = :1
        """,
        [flight_id]
    )
    return row_to_dict(cur)


def get_flight_results(conn: oracledb.Connection, flight_id: int) -> list[dict[str, Any]]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT UPPER(p.PARAM_NAME) AS PARAM_NAME,
               p.DESCRIPTION,
               r.PARAM_VAL,
               u.UNIT_NAME,
               r.STATUS
          FROM RESULTS r
          JOIN PARAMETERS p ON p.PARAM_ID = r.PARAM_ID
          LEFT JOIN UNITS u ON u.UNIT_ID = p.UNIT_ID
         WHERE r.FLIGHT_ID = :1
         ORDER BY p.PARAM_NAME
        """,
        [flight_id]
    )
    return rows_to_dicts(cur)


def get_flight_events(conn: oracledb.Connection, flight_id: int) -> list[dict[str, Any]]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT e.EVENT_NAME,
               et.DATE_TIME,
               et.OCCUR_SEQ
          FROM EVENT_TIMESTAMPS et
          JOIN EVENTS e ON e.EVENT_ID = et.EVENT_ID
         WHERE et.FLIGHT_ID = :1
         ORDER BY et.DATE_TIME ASC NULLS LAST
        """,
        [flight_id]
    )
    return rows_to_dicts(cur)
