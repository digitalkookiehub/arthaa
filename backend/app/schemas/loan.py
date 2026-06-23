from datetime import date
from pydantic import BaseModel
from app.models.loan import LoanType, PrepaymentType, RepaymentType


class LoanCreate(BaseModel):
    loan_type: LoanType
    bank_name: str
    loan_account_number: str | None = None
    loan_amount: int                      # paise
    outstanding_balance: int              # paise (initially = loan_amount)
    starting_interest_rate: float | None = None  # only for floating rate loans
    interest_rate: float                  # current rate (= starting_interest_rate for new loans)
    start_date: date
    tenure_months: int | None = None      # None is valid for bullet loans (no EMI schedule)
    remaining_tenure: int | None = None   # if omitted, defaults to tenure_months
    emi_amount: int | None = None         # paise — if omitted, auto-computed; 0 for bullet
    is_floating: bool = False
    repayment_type: RepaymentType = RepaymentType.emi
    account_id: int | None = None


class LoanUpdate(BaseModel):
    loan_type: LoanType | None = None
    bank_name: str | None = None
    loan_account_number: str | None = None
    loan_amount: int | None = None
    outstanding_balance: int | None = None
    interest_rate: float | None = None
    emi_amount: int | None = None
    start_date: date | None = None
    tenure_months: int | None = None
    remaining_tenure: int | None = None
    is_floating: bool | None = None
    repayment_type: RepaymentType | None = None


class PrepaymentCreate(BaseModel):
    amount: int
    date: date
    prepayment_type: PrepaymentType


class RateChangeCreate(BaseModel):
    new_rate: float
    effective_date: date
    adjust_type: str = 'tenure'      # 'tenure' = keep EMI | 'emi' = keep tenure
    note: str | None = None
    old_rate: float | None = None    # overrides loan.interest_rate when provided
    skip_tenure_update: bool = False  # True when importing from statement — tenure set separately


class RepaymentScheduleResponse(BaseModel):
    id: int
    loan_id: int
    emi_number: int
    principal: int
    interest: int
    outstanding_balance: int
    due_date: str
    paid: bool
    paid_date: str | None

    model_config = {"from_attributes": True}


class RateHistoryResponse(BaseModel):
    id: int
    old_rate: float
    new_rate: float
    effective_date: str
    emi_impact: int | None      # paise — positive = EMI went up
    tenure_impact: int | None   # months — positive = tenure extended
    adjust_type: str | None
    note: str | None
    created_at: str

    model_config = {"from_attributes": True}


class LoanResponse(BaseModel):
    id: int
    loan_type: str
    bank_name: str
    loan_account_number: str | None = None
    loan_amount: int
    outstanding_balance: int
    starting_interest_rate: float | None = None
    interest_rate: float
    emi_amount: int
    start_date: str
    tenure_months: int
    remaining_tenure: int
    is_floating: bool = False
    repayment_type: str = 'emi'
    total_interest_payable: int = 0
    accrued_interest: int = 0          # paise — interest since last payment (bullet only)
    total_interest_paid: int = 0       # paise — sum of all partial payments (bullet only)
    last_interest_payment_date: str | None = None  # ISO date of last partial payment
    created_at: str

    model_config = {"from_attributes": True}


class GoldInterestPaymentCreate(BaseModel):
    amount: int          # paise
    payment_date: date
    note: str | None = None


class GoldInterestPaymentResponse(BaseModel):
    id: int
    loan_id: int
    amount: int
    payment_date: str
    note: str | None
    created_at: str

    model_config = {"from_attributes": True}


class PrepaymentSimulation(BaseModel):
    prepayment_amount: int
    interest_saved: int
    tenure_reduced: int
    new_emi: int
    new_tenure: int
