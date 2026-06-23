import enum

from sqlalchemy import Column, Date, Enum, Float, ForeignKey, Integer, String

from app.database import Base
from app.models.base import TimestampMixin


class InvestmentType(str, enum.Enum):
    PPF = "PPF"
    EPF = "EPF"
    NPS = "NPS"
    MutualFund = "MutualFund"
    SIP = "SIP"
    Stocks = "Stocks"
    FD = "FD"
    Gold = "Gold"
    PostOffice = "PostOffice"
    Other = "Other"


class Investment(Base, TimestampMixin):
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    investment_type = Column(Enum(InvestmentType), nullable=False)
    name = Column(String(200), nullable=False)
    invested_amount = Column(Integer, nullable=False)   # in paise
    current_value = Column(Integer, nullable=False)     # in paise
    returns_pct = Column(Float, nullable=True)
    start_date = Column(Date, nullable=True)
    maturity_date = Column(Date, nullable=True)
    notes = Column(String(500), nullable=True)
