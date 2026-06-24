from pydantic import BaseModel
from uuid import UUID
from typing import Optional

class StagedDocumentResponse(BaseModel):
    document_id: UUID
    filename: str
    status: str
    message: str

    class Config:
        from_attributes = True # Allows SQLAlchemy models to be read easily