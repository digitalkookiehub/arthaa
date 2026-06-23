import enum

from sqlalchemy import Boolean, Column, Date, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.base import TimestampMixin


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    upi = "upi"
    card = "card"
    net_banking = "net_banking"
    cheque = "cheque"


class RecurringInterval(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    icon = Column(String(50), nullable=True)
    color = Column(String(10), nullable=True)
    is_system = Column(Boolean, default=False)


class Expense(Base, TimestampMixin):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id = Column(
        Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category_id = Column(
        Integer, ForeignKey("expense_categories.id"), nullable=False
    )
    date = Column(Date, nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # in paise
    description = Column(String(500), nullable=True)
    subcategory = Column(String(100), nullable=True)
    payment_method = Column(Enum(PaymentMethod), nullable=True)
    location = Column(String(200), nullable=True)
    tags = Column(ARRAY(String), default=[])
    is_recurring = Column(Boolean, default=False)
    recurring_interval = Column(Enum(RecurringInterval), nullable=True)
    bill_attachment_url = Column(String(500), nullable=True)

    category = relationship("ExpenseCategory", lazy="select")

    __table_args__ = (Index("ix_expenses_user_date", "user_id", "date"),)


class RecurringExpense(Base, TimestampMixin):
    __tablename__ = "recurring_expenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expense_template_id = Column(
        Integer, ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False
    )
    next_due_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True)
