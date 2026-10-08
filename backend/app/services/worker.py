import asyncio
import logging
import traceback
from pathlib import Path
from app.db.pool import connection
from app.config import get_settings
from app.services import excel_to_parquet

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('worker')

async def ingestion_worker():
    """Background task to process pending ingestion jobs."""
    s = get_settings()
    data_dir = Path(s.data_dir).resolve()
    
    while True:
        try:
            with connection() as conn:
                cur = conn.cursor()
                
                # 1. Claim a pending job using SKIP LOCKED
                cur.execute(
                    """
                    SELECT fs.FLIGHT_STATUS_ID, fs.FLIGHT_ID, f.AIRCRAFT_ID, f.FLIGHT_NUMBER, a.AIRCRAFT_NUMBER
                      FROM FLIGHT_STATUS fs
                      JOIN FLIGHTS f ON fs.FLIGHT_ID = f.FLIGHT_ID
                      JOIN AIRCRAFTS a ON f.AIRCRAFT_ID = a.AIRCRAFT_ID
                     WHERE fs.STATUS = 'PENDING'
                       AND ROWNUM = 1
                       FOR UPDATE OF fs.STATUS SKIP LOCKED
                    """
                )
                row = cur.fetchone()
                
                if row:
                    status_id, flight_id, ac_id, f_num, ac_num = row
                    logger.info(f"Worker claimed status {status_id} for flight {flight_id}")
                    
                    # 2. Update to UPLOADING
                    cur.execute(
                        "UPDATE FLIGHT_STATUS SET STATUS = 'UPLOADING', DATE_TIME = SYSTIMESTAMP WHERE FLIGHT_STATUS_ID = :1",
                        [status_id]
                    )
                    conn.commit()
                    
                    # 3. Process
                    try:
                        # Find the folder (e.g. AC1_001_*)
                        ac_dir = data_dir / "Aircrafts" / f"AC{ac_num}"
                        target_dir = None
                        if ac_dir.exists():
                            for flight_dir in ac_dir.iterdir():
                                if flight_dir.is_dir() and flight_dir.name.startswith(f"AC{ac_num}_{f_num:03d}_"):
                                    target_dir = flight_dir
                                    break
                                    
                        if not target_dir:
                            raise FileNotFoundError(f"Could not locate folder for AC{ac_num} Flight {f_num}")
                            
                        raw_dir = target_dir / "Raw"
                        if not raw_dir.exists():
                            raw_dir = target_dir
                            
                        # Run conversion
                        output_dir = target_dir / "Derived"
                        output_dir.mkdir(parents=True, exist_ok=True)
                        
                        logger.info(f"Starting Parquet conversion for {len(list(raw_dir.glob('*.xlsx')))} files. This may take a few minutes...")
                        
                        # Process all xlsx files
                        for excel_file in raw_dir.glob("*.xlsx"):
                            logger.info(f"Converting {excel_file.name} to Parquet...")
                            await asyncio.to_thread(
                                excel_to_parquet.convert,
                                excel_path=excel_file,
                                output=output_dir,
                                compression="zstd"
                            )
                            logger.info(f"Finished {excel_file.name}")
                            
                        # Success
                        cur.execute(
                            "UPDATE FLIGHT_STATUS SET STATUS = 'UPLOAD COMPLETE', DATE_TIME = SYSTIMESTAMP WHERE FLIGHT_STATUS_ID = :1",
                            [status_id]
                        )
                        cur.execute(
                            "UPDATE FLIGHTS SET UPLOAD_END_TIME = SYSTIMESTAMP WHERE FLIGHT_ID = :1",
                            [flight_id]
                        )
                        conn.commit()
                        logger.info(f"Flight {flight_id} completed successfully (Upload Complete)")
                        
                    except Exception as e:
                        logger.error(f"Flight {flight_id} failed: {e}")
                        cur.execute(
                            "UPDATE FLIGHT_STATUS SET STATUS = 'UPLOAD FAILED', REMARKS = :1, DATE_TIME = SYSTIMESTAMP WHERE FLIGHT_STATUS_ID = :2",
                            [str(traceback.format_exc()), status_id]
                        )
                        cur.execute(
                            "UPDATE FLIGHTS SET UPLOAD_END_TIME = SYSTIMESTAMP WHERE FLIGHT_ID = :1",
                            [flight_id]
                        )
                        conn.commit()
                        
        except Exception as e:
            logger.error(f"Worker iteration error: {e}")
            
        await asyncio.sleep(5)
