from datetime import date
from typing import Optional
from pydantic import BaseModel, field_validator


VALID_CYCLES = {'monthly', 'yearly', 'quarterly', 'half_yearly', 'weekly'}


class SubscriptionCreate(BaseModel):
    name: str
    amount: int                          # paise per billing cycle
    billing_cycle: str = 'monthly'
    next_billing_date: date
    category: Optional[str] = None
    is_active: bool = True

    @field_validator('billing_cycle')
    @classmethod
    def check_cycle(cls, v: str) -> str:
        if v not in VALID_CYCLES:
            raise ValueError(f'billing_cycle must be one of {VALID_CYCLES}')
        return v


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[int] = None
    billing_cycle: Optional[str] = None
    next_billing_date: Optional[date] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


class SubscriptionResponse(BaseModel):
    id: int
    name: str
    amount: int                          # paise per billing cycle
    billing_cycle: str
    next_billing_date: str               # ISO date
    category: Optional[str]
    is_active: bool
    monthly_equivalent: int              # paise — normalised to /month
    days_until_billing: int              # days to next_billing_date
    created_at: str

    model_config = {'from_attributes': True}
