from datetime import datetime
from typing import Optional
import enum
from sqlalchemy import Integer, String, Text, DateTime, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base 
from sqlalchemy.sql import func

# Define the strict state machine for document processing
class DocumentStatus(enum.Enum):
    PENDING_REVIEW = "pending_review"  # Awaiting human admin approval in the UI
    APPROVED = "approved"              # Cleared to be embedded into Qdrant Vector DB
    REJECTED = "rejected"              # Flagged/Deleted due to massive errors or PHI risks

# Track the exact origin of the clinical data
class IngestionSource(enum.Enum):
    MANUAL_UPLOAD = "manual_upload"        # Drag-and-drop PDFs/Excel from the UI
    MIMIC_API_WORKER = "mimic_api_worker" # Background Celery cron jobs pulling batches
    DYNAMIC_API_UI = "dynamic_api_ui"      # Pasted endpoint URLs from the Command Center

# The Universal Staging Table
class DocumentStaging(Base):
    __tablename__ = "document_staging"

    # Core Identifiers
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    
    # Using Mapped/mapped_column fixes the Pylance type-mismatch error
    source: Mapped[IngestionSource] = mapped_column(Enum(IngestionSource), nullable=False, index=True)
    status: Mapped[DocumentStatus] = mapped_column(Enum(DocumentStatus), default=DocumentStatus.PENDING_REVIEW, index=True)
    
    filename: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    file_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # The Universal Payload Storage (The "Before")
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # The Output Storage (The "After")
    sanitized_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Audit Trail & Observability
    # Using 'datetime' type hint for Mapped instead of SQLAlchemy class
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)