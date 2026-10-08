from pydantic import BaseModel
from typing import List

class FolderInfo(BaseModel):
    folder_path: str
    folder_name: str
    flight_id: str
    date_str: str
    aircraft: str
    file_count: int
    size_bytes: int
    status: str
    error_message: str | None = None

class ScanResult(BaseModel):
    folders: List[FolderInfo]

class StartIngestionRequest(BaseModel):
    folder_name: str
