from __future__ import annotations

from typing import Any
import oracledb

from app.db.pool import row_to_dict, rows_to_dicts

def list_all(conn: oracledb.Connection) -> list[dict[str, Any]]:
    cur = conn.cursor()
    # Left join with FLIGHTS to get the flight count for each aircraft
    cur.execute(
        """
        SELECT a.AIRCRAFT_ID, a.AIRCRAFT_NUMBER, a.AIRCRAFT_MASS_KG, a.MODIFIED,
               COUNT(f.FLIGHT_ID) AS FLIGHT_COUNT
          FROM AIRCRAFTS a
          LEFT JOIN FLIGHTS f ON a.AIRCRAFT_ID = f.AIRCRAFT_ID
         GROUP BY a.AIRCRAFT_ID, a.AIRCRAFT_NUMBER, a.AIRCRAFT_MASS_KG, a.MODIFIED
         ORDER BY a.AIRCRAFT_NUMBER
        """
    )
    return rows_to_dicts(cur)

def get_by_number(conn: oracledb.Connection, aircraft_number: int) -> dict[str, Any] | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT AIRCRAFT_ID, AIRCRAFT_NUMBER, AIRCRAFT_MASS_KG, MODIFIED
          FROM AIRCRAFTS
         WHERE AIRCRAFT_NUMBER = :n
        """,
        n=aircraft_number,
    )
    return row_to_dict(cur)

def create(conn: oracledb.Connection, aircraft_number: int, aircraft_mass_kg: float | None) -> int:
    cur = conn.cursor()
    out_id = cur.var(int)
    cur.execute(
        """
        INSERT INTO AIRCRAFTS (AIRCRAFT_ID, AIRCRAFT_NUMBER, AIRCRAFT_MASS_KG, MODIFIED)
        VALUES (AIRCRAFTS_SEQ.NEXTVAL, :n, :m, SYSTIMESTAMP)
        RETURNING AIRCRAFT_ID INTO :out_id
        """,
        n=aircraft_number,
        m=aircraft_mass_kg,
        out_id=out_id,
    )
    return int(out_id.getvalue()[0])

def update(conn: oracledb.Connection, aircraft_id: int, aircraft_mass_kg: float | None) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE AIRCRAFTS
           SET AIRCRAFT_MASS_KG = :m,
               MODIFIED = SYSTIMESTAMP
         WHERE AIRCRAFT_ID = :i
        """,
        m=aircraft_mass_kg,
        i=aircraft_id,
    )

def delete(conn: oracledb.Connection, aircraft_id: int) -> None:
    cur = conn.cursor()
    cur.execute("DELETE FROM AIRCRAFTS WHERE AIRCRAFT_ID = :i", i=aircraft_id)
