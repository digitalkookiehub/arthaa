import enum

from sqlalchemy import Boolean, Column, Date, Enum, ForeignKey, Integer, String

from app.database import Base
from app.models.base import TimestampMixin


class InsuranceType(str, enum.Enum):
    life = "life"
    health = "health"
    vehicle = "vehicle"
    other = "other"


class Insurance(Base, TimestampMixin):
    __tablename__ = "insurance"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    insurance_type = Column(Enum(InsuranceType), nullable=False)
    provider = Column(String(100), nullable=False)
    policy_number = Column(String(100), nullable=True)
    premium_amount = Column(Integer, nullable=False)   # in paise
    premium_frequency = Column(String(20), default="yearly")
    renewal_date = Column(Date, nullable=False)
    coverage_amount = Column(Integer, nullable=True)   # in paise
    nominee = Column(String(100), nullable=True)


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(100), nullable=False)
    amount = Column(Integer, nullable=False)            # in paise
    billing_cycle = Column(String(20), default="monthly")
    next_billing_date = Column(Date, nullable=False)
    category = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
