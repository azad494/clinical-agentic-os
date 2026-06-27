from pydantic import BaseModel
from typing import Optional

class StagedDocumentResponse(BaseModel):
    id: int                                # Fixed: Changed from UUID to int to align with models.py primary key
    filename: Optional[str] = None
    status: str                            # Will return string values like "pending_review", "cleaning", "failed"
    category: Optional[str] = "Unknown"   # Added: Tracks the Gemini classification tag
    message: str
    error_message: Optional[str] = None    # Added: Allows frontend to easily render background worker faults

    class Config:
        from_attributes = True             # Allows SQLAlchemy model tracking to be read easily