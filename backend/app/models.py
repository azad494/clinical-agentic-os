from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
import uuid
from datetime import datetime

Base = declarative_base()

class DocumentStaging(Base):
    __tablename__ = "document_staging"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False) 
    raw_text = Column(Text, nullable=True) 
    sanitized_text = Column(Text, nullable=True) 
    status = Column(String, default="pending_human_review") 
    created_at = Column(DateTime, default=datetime.utcnow)