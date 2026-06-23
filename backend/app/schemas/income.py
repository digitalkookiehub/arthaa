from datetime import date as Date
from pydantic import BaseModel
from app.models.income import IncomeSourceType


class IncomeCreate(BaseModel):
    account_id: int | None = None
    source_type: IncomeSourceType
    amount: int  # paise
    date: Date
    description: str | None = None
    is_recurring: bool = False
    recurring_interval: str | None = None


class IncomeUpdate(BaseModel):
    account_id: int | None = None
    source_type: IncomeSourceType | None = None
    amount: int | None = None
    date: Date | None = None
    description: str | None = None


class IncomeResponse(BaseModel):
    id: int
    account_id: int | None
    source_type: str
    amount: int
    date: str
    description: str | None
    is_recurring: bool
    created_at: str

    model_config = {"from_attributes": True}
