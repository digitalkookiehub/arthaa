import calendar
from datetime import date, date as _date
from pydantic import BaseModel


class CreditCardCreate(BaseModel):
    card_name: str
    bank_name: str
    last4_digits: str
    credit_limit: int                    # paise
    outstanding_balance: int = 0         # paise
    due_date: int | None = None          # day of month 1-31
    minimum_due: int = 0                 # paise
    interest_rate: float | None = None   # annual %
    rewards_points: int = 0


class CreditCardUpdate(BaseModel):
    card_name: str | None = None
    bank_name: str | None = None
    credit_limit: int | None = None
    outstanding_balance: int | None = None
    due_date: int | None = None
    minimum_due: int | None = None
    interest_rate: float | None = None
    rewards_points: int | None = None
    is_active: bool | None = None


class CreditCardResponse(BaseModel):
    id: int
    card_name: str
    bank_name: str
    last4_digits: str
    credit_limit: int
    outstanding_balance: int
    due_date: int | None
    minimum_due: int
    interest_rate: float | None
    rewards_points: int
    is_active: bool
    utilization_pct: float           # computed: outstanding / limit * 100
    days_until_due: int | None       # computed from due_date day-of-month
    created_at: str

    model_config = {"from_attributes": True}


class TransactionCreate(BaseModel):
    amount: int                          # paise, always positive
    description: str | None = None
    date: date
    category_id: int | None = None
    is_payment: bool = False             # True = bill payment


class TransactionResponse(BaseModel):
    id: int
    credit_card_id: int
    amount: int
    description: str | None
    date: str
    category_id: int | None
    is_payment: bool
    created_at: str

    model_config = {"from_attributes": True}
