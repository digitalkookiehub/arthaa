from sqlalchemy import Boolean, Column, Date, ForeignKey, Index, Integer, String

from app.database import Base
from app.models.base import TimestampMixin


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notification_type = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(String(1000), nullable=False)
    scheduled_date = Column(Date, nullable=True)
    is_read = Column(Boolean, default=False)

    __table_args__ = (Index("ix_notifications_user_read", "user_id", "is_read"),)
