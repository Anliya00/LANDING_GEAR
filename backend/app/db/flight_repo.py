from __future__ import annotations

from typing import Any
import oracledb
from app.db.pool import rows_to_dicts

def list_all(conn: oracledb.Connection) -> list[dict[str, Any]]:
    cur = conn.cursor()
    # Left join AIRCRAFTS to get aircraft_number
    # Left join JOB_QUEUE to get the latest status
    cur.execute(
        """
        SELECT f.FLIGHT_ID, f.AIRCRAFT_ID, a.AIRCRAFT_NUMBER, f.FLIGHT_NUMBER, f.FLIGHT_DATE_TIME,
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
