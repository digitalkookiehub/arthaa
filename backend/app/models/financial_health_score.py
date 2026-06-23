import enum

from sqlalchemy import Column, Date, Enum, ForeignKey, Integer, UniqueConstraint

from app.database import Base


class HealthRating(str, enum.Enum):
    poor = "poor"
    average = "average"
    good = "good"
    excellent = "excellent"


class FinancialHealthScore(Base):
    __tablename__ = "financial_health_scores"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    score = Column(Integer, nullable=False)              # 0-100
    savings_ratio_score = Column(Integer, default=0)
    debt_ratio_score = Column(Integer, default=0)
    emergency_fund_score = Column(Integer, default=0)
    investment_ratio_score = Column(Integer, default=0)
    insurance_score = Column(Integer, default=0)
    credit_utilization_score = Column(Integer, default=0)
    rating = Column(Enum(HealthRating), nullable=False)
    recorded_date = Column(Date, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "recorded_date", name="uq_health_score_user_date"
        ),
    )
