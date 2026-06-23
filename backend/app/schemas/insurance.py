from datetime import date
from typing import Optional
from pydantic import BaseModel, field_validator


VALID_FREQUENCIES = {'monthly', 'quarterly', 'half_yearly', 'yearly'}
VALID_TYPES       = {'life', 'health', 'vehicle', 'other'}


class InsuranceCreate(BaseModel):
    insurance_type: str
    provider: str
    policy_number: Optional[str] = None
    premium_amount: int                    # paise per premium_frequency
    premium_frequency: str = 'yearly'
    renewal_date: date
    coverage_amount: Optional[int] = None  # paise
    nominee: Optional[str] = None

    @field_validator('insurance_type')
    @classmethod
    def check_type(cls, v: str) -> str:
        if v not in VALID_TYPES:
            raise ValueError(f'insurance_type must be one of {VALID_TYPES}')
        return v

    @field_validator('premium_frequency')
    @classmethod
    def check_freq(cls, v: str) -> str:
        if v not in VALID_FREQUENCIES:
            raise ValueError(f'premium_frequency must be one of {VALID_FREQUENCIES}')
        return v


class InsuranceUpdate(BaseModel):
    insurance_type: Optional[str] = None
    provider: Optional[str] = None
    policy_number: Optional[str] = None
    premium_amount: Optional[int] = None
    premium_frequency: Optional[str] = None
    renewal_date: Optional[date] = None
    coverage_amount: Optional[int] = None
    nominee: Optional[str] = None


class InsuranceResponse(BaseModel):
    id: int
    insurance_type: str
    provider: str
    policy_number: Optional[str]
    premium_amount: int
    premium_frequency: str
    renewal_date: str
    coverage_amount: Optional[int]
    nominee: Optional[str]
    yearly_premium: int        # normalised to annual cost in paise
    days_until_renewal: int
    is_expired: bool
    created_at: str

    model_config = {'from_attributes': True}
