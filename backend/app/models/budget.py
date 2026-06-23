from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint

from app.database import Base
from app.models.base import TimestampMixin


class Budget(Base, TimestampMixin):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    category_id = Column(
        Integer, ForeignKey("expense_categories.id"), nullable=False
    )
    budgeted_amount = Column(Integer, nullable=False)  # in paise

    __table_args__ = (
        UniqueConstraint(
            "user_id", "month", "year", "category_id", name="uq_budget_user_month_cat"
        ),
        Index("ix_budgets_user_month_year", "user_id", "month", "year"),
    )
