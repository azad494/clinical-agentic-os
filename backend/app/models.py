from sqlalchemy import Column, Integer, String, Text, DateTime, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
import enum
from database import Base # Ensure this matches your declarative_base() import

# Define the strict state machine for document processing
class DocumentStatus(enum.Enum):
    PENDING_REVIEW = "pending_review"  # Awaiting human admin approval in the UI
    APPROVED = "approved"              # Cleared to be embedded into Qdrant Vector DB
    REJECTED = "rejected"              # Flagged/Deleted due to massive errors or PHI risks

# Track the exact origin of the clinical data
class IngestionSource(enum.Enum):
    MANUAL_UPLOAD = "manual_upload"       # Drag-and-drop PDFs/Excel from the UI
    MIMIC_API_WORKER = "mimic_api_worker" # Background Celery cron jobs pulling batches
    DYNAMIC_API_UI = "dynamic_api_ui"     # Pasted endpoint URLs from the Command Center

# The Universal Staging Table
class DocumentStaging(Base):
    __tablename__ = "document_staging"

    # Core Identifiers
    id = Column(Integer, primary_key=True, index=True)
    source = Column(Enum(IngestionSource), nullable=False, index=True)
    filename = Column(String, index=True, nullable=True) # Nullable because API payloads don't have filenames
    file_type = Column(String, nullable=True) # e.g., 'application/pdf', 'application/json'
    
    # The Universal Payload Storage (The "Before")
    raw_text = Column(Text, nullable=True)       # Stores flat text parsed from manual PDFs/Files
    raw_json = Column(JSONB, nullable=True)      # Stores raw structured JSON payloads from the MIMIC API
    
    # The Output Storage (The "After")
    sanitized_text = Column(Text, nullable=True) # The final, cleaned text returned by the AI agent
    
    # Audit Trail & Observability
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING_REVIEW, index=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(String, nullable=True)   # Maps to the Admin ID who clicks "Approve"