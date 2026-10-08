from __future__ import annotations

import oracledb
from typing import Optional

def create_flight_and_job(conn: oracledb.Connection, aircraft_number: int, flight_number: int, flight_date_time) -> int:
    cur = conn.cursor()
    # 1. Look up aircraft ID
    cur.execute("SELECT AIRCRAFT_ID FROM AIRCRAFTS WHERE AIRCRAFT_NUMBER = :1", [aircraft_number])
    ac_row = cur.fetchone()
    if not ac_row:
        raise ValueError(f"Aircraft AC{aircraft_number} not found in database.")
    aircraft_id = ac_row[0]

    # 2. Insert Flight or get existing
    cur.execute("SELECT FLIGHT_ID FROM FLIGHTS WHERE AIRCRAFT_ID = :1 AND FLIGHT_NUMBER = :2", [aircraft_id, flight_number])
    f_row = cur.fetchone()
    
    if f_row:
        flight_id = f_row[0]
    else:
        # Create flight
        cur.execute("SELECT FLIGHTS_SEQ.NEXTVAL FROM DUAL")
        flight_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO FLIGHTS (FLIGHT_ID, AIRCRAFT_ID, FLIGHT_NUMBER, FLIGHT_DATE_TIME, UPLOAD_START_TIME)
            VALUES (:1, :2, :3, :4, SYSTIMESTAMP)
            """,
            [flight_id, aircraft_id, flight_number, flight_date_time]
        )

    # 3. Create or reset Flight Status
    # If a status already exists, reset it to PENDING. Otherwise create new.
    cur.execute("SELECT FLIGHT_STATUS_ID FROM FLIGHT_STATUS WHERE FLIGHT_ID = :1", [flight_id])
    fs_row = cur.fetchone()
    
    if fs_row:
        cur.execute(
            """
            UPDATE FLIGHT_STATUS 
               SET STATUS = 'PENDING', REMARKS = NULL, DATE_TIME = SYSTIMESTAMP 
             WHERE FLIGHT_STATUS_ID = :1
            """,
            [fs_row[0]]
        )
    else:
        cur.execute("SELECT FLIGHT_STATUS_SEQ.NEXTVAL FROM DUAL")
        status_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO FLIGHT_STATUS (FLIGHT_STATUS_ID, FLIGHT_ID, STATUS, DATE_TIME)
            VALUES (:1, :2, 'PENDING', SYSTIMESTAMP)
            """,
            [status_id, flight_id]
        )
        
    return flight_id
