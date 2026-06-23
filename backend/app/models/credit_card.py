from sqlalchemy import Boolean, Column, Date, Float, ForeignKey, Index, Integer, String

from app.database import Base
from app.models.base import TimestampMixin


class CreditCard(Base, TimestampMixin):
    __tablename__ = "credit_cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_name = Column(String(100), nullable=False)
    bank_name = Column(String(100), nullable=False)
    last4_digits = Column(String(4), nullable=False)
    credit_limit = Column(Integer, nullable=False)       # in paise
    outstanding_balance = Column(Integer, default=0)     # in paise
    due_date = Column(Integer, nullable=True)            # day of month 1-31
    minimum_due = Column(Integer, default=0)             # in paise
    interest_rate = Column(Float, nullable=True)         # annual %
    rewards_points = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)


class CreditCardTransaction(Base, TimestampMixin):
    __tablename__ = "credit_card_transactions"

    id = Column(Integer, primary_key=True, index=True)
    credit_card_id = Column(
        Integer,
        ForeignKey("credit_cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount = Column(Integer, nullable=False)             # in paise, always positive
    description = Column(String(500), nullable=True)
    date = Column(Date, nullable=False)
    category_id = Column(
        Integer, ForeignKey("expense_categories.id"), nullable=True
    )
    is_payment = Column(Boolean, default=False, server_default='false', nullable=False)
    # True = bill payment (reduces outstanding), False = purchase (increases outstanding)
