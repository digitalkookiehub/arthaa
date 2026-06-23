import enum

from sqlalchemy import Boolean, Column, Date, Enum, Float, ForeignKey, Index, Integer, String, Text

from app.database import Base
from app.models.base import TimestampMixin


class LoanType(str, enum.Enum):
    home = "home"
    personal = "personal"
    gold = "gold"
    car = "car"
    education = "education"
    credit_card = "credit_card"
    other = "other"


class PrepaymentType(str, enum.Enum):
    lump_sum = "lump_sum"
    emi_increase = "emi_increase"
    tenure_reduce = "tenure_reduce"


class RepaymentType(str, enum.Enum):
    emi = "emi"       # regular monthly EMI
    bullet = "bullet" # no EMI — principal + accrued interest paid at closure


class Loan(Base, TimestampMixin):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    loan_type = Column(Enum(LoanType), nullable=False)
    bank_name = Column(String(100), nullable=False)
    loan_account_number = Column(String(50), nullable=True)
    loan_amount = Column(Integer, nullable=False)          # original, in paise
    outstanding_balance = Column(Integer, nullable=False)  # current, in paise
    starting_interest_rate = Column(Float, nullable=True)  # original rate when loan was taken
    interest_rate = Column(Float, nullable=False)          # current annual %
    emi_amount = Column(Integer, nullable=False)           # in paise
    start_date = Column(Date, nullable=False)
    tenure_months = Column(Integer, nullable=False)
    remaining_tenure = Column(Integer, nullable=False)
    account_id = Column(
        Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    is_floating = Column(Boolean, default=False, server_default='false', nullable=False)
    repayment_type = Column(Enum(RepaymentType), default=RepaymentType.emi, server_default='emi', nullable=False)
    closure_date = Column(Date, nullable=True)   # actual date gold was returned / loan closed


class RepaymentSchedule(Base):
    __tablename__ = "repayment_schedules"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(
        Integer, ForeignKey("loans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    emi_number = Column(Integer, nullable=False)
    principal = Column(Integer, nullable=False)            # in paise
    interest = Column(Integer, nullable=False)             # in paise
    outstanding_balance = Column(Integer, nullable=False)  # in paise
    due_date = Column(Date, nullable=False)
    paid = Column(Boolean, default=False)
    paid_date = Column(Date, nullable=True)

    __table_args__ = (Index("ix_repayment_loan_emi", "loan_id", "emi_number"),)


class InterestRateHistory(Base, TimestampMixin):
    __tablename__ = "interest_rate_history"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(
        Integer, ForeignKey("loans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    old_rate = Column(Float, nullable=False)
    new_rate = Column(Float, nullable=False)
    effective_date = Column(Date, nullable=False)
    emi_impact = Column(Integer, nullable=True)      # in paise
    tenure_impact = Column(Integer, nullable=True)   # months
    adjust_type = Column(String(20), default='tenure', nullable=True)  # 'emi' or 'tenure'
    note = Column(String(200), nullable=True)        # e.g. "RBI repo rate cut Oct 2024"


class GoldInterestPayment(Base, TimestampMixin):
    """Tracks partial interest payments on gold (bullet) loans."""
    __tablename__ = "gold_interest_payments"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(
        Integer, ForeignKey("loans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount = Column(Integer, nullable=False)   # paise paid
    payment_date = Column(Date, nullable=False)
    note = Column(String(200), nullable=True)


class LoanPrepayment(Base, TimestampMixin):
    __tablename__ = "loan_prepayments"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(
        Integer, ForeignKey("loans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount = Column(Integer, nullable=False)               # in paise
    date = Column(Date, nullable=False)
    prepayment_type = Column(Enum(PrepaymentType), nullable=False)
    interest_saved = Column(Integer, nullable=True)        # in paise
    tenure_reduced = Column(Integer, nullable=True)        # months
