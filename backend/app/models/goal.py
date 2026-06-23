import enum

from sqlalchemy import Column, Date, Enum, ForeignKey, Integer, String

from app.database import Base
from app.models.base import TimestampMixin


class GoalType(str, enum.Enum):
    emergency_fund = "emergency_fund"
    retirement = "retirement"
    house = "house"
    education = "education"
    vacation = "vacation"
    custom = "custom"


class GoalStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    paused = "paused"


class Goal(Base, TimestampMixin):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    goal_type = Column(Enum(GoalType), nullable=False)
    name = Column(String(200), nullable=False)
    target_amount = Column(Integer, nullable=False)        # in paise
    current_amount = Column(Integer, default=0)            # in paise
    target_date = Column(Date, nullable=True)
    monthly_contribution = Column(Integer, nullable=True)  # in paise
    priority = Column(Integer, default=3)                  # 1-5
    status = Column(Enum(GoalStatus), default=GoalStatus.active)
