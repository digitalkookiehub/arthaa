import enum

from sqlalchemy import Column, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSON

from app.database import Base
from app.models.base import TimestampMixin


class AuditAction(str, enum.Enum):
    create = "create"
    update = "update"
    delete = "delete"


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    table_name = Column(String(100), nullable=False)
    record_id = Column(Integer, nullable=False)
    action = Column(Enum(AuditAction), nullable=False)
    old_data = Column(JSON, nullable=True)
    new_data = Column(JSON, nullable=True)

    __table_args__ = (Index("ix_audit_user_table", "user_id", "table_name"),)
