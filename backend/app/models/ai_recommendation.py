from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSON

from app.database import Base
from app.models.base import TimestampMixin


class AIRecommendation(Base, TimestampMixin):
    __tablename__ = "ai_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recommendation_type = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(JSON, nullable=False)
    ai_model = Column(String(50), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
