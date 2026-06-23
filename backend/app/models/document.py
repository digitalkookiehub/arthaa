import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSON

from app.database import Base
from app.models.base import TimestampMixin


class DocumentType(str, enum.Enum):
    bank_statement = "bank_statement"
    loan_statement = "loan_statement"
    investment_statement = "investment_statement"
    insurance = "insurance"
    bill = "bill"
    receipt = "receipt"
    other = "other"


class OcrStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type = Column(Enum(DocumentType), nullable=False)
    file_name = Column(String(500), nullable=False)
    file_url = Column(String(1000), nullable=False)
    file_size_kb = Column(Integer, nullable=True)
    ocr_status = Column(Enum(OcrStatus), default=OcrStatus.pending)
    extracted_data = Column(JSON, nullable=True)
