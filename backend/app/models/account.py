import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, Index, Integer, String

from app.database import Base
from app.models.base import TimestampMixin


class AccountType(str, enum.Enum):
    bank = "bank"
    cash = "cash"
    wallet = "wallet"
    upi = "upi"


class Account(Base, TimestampMixin):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(100), nullable=False)
    account_type = Column(Enum(AccountType), nullable=False)
    bank_name = Column(String(100), nullable=True)
    account_number_masked = Column(String(20), nullable=True)
    balance = Column(Integer, default=0)  # in paise
    is_active = Column(Boolean, default=True)

    __table_args__ = (Index("ix_accounts_user_active", "user_id", "is_active"),)
