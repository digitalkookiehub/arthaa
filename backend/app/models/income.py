import enum

from sqlalchemy import Boolean, Column, Date, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base
from app.models.base import TimestampMixin


class IncomeSourceType(str, enum.Enum):
    salary = "salary"
    bonus = "bonus"
    rental = "rental"
    interest = "interest"
    side_business = "side_business"
    freelancing = "freelancing"
    dividend = "dividend"
    other = "other"


class Income(Base, TimestampMixin):
    __tablename__ = "income"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id = Column(
        Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    source_type = Column(Enum(IncomeSourceType), nullable=False)
    amount = Column(Integer, nullable=False)  # in paise
    date = Column(Date, nullable=False, index=True)
    description = Column(String(500), nullable=True)
    is_recurring = Column(Boolean, default=False)
    recurring_interval = Column(String(20), nullable=True)
    deductions = Column(JSONB, nullable=True, default=list)  # [{"label": str, "amount_paise": int}]
    total_deductions_paise = Column(Integer, nullable=True)
    gross_pay_paise = Column(Integer, nullable=True)

    __table_args__ = (Index("ix_income_user_date", "user_id", "date"),)
