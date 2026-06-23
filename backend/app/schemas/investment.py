from datetime import date
from pydantic import BaseModel
from app.models.investment import InvestmentType


class InvestmentCreate(BaseModel):
    investment_type: InvestmentType
    name: str
    invested_amount: int    # paise
    current_value: int      # paise
    returns_pct: float | None = None
    start_date: date | None = None
    maturity_date: date | None = None
    notes: str | None = None


class InvestmentUpdate(BaseModel):
    name: str | None = None
    current_value: int | None = None
    returns_pct: float | None = None
    maturity_date: date | None = None
    notes: str | None = None


class InvestmentResponse(BaseModel):
    id: int
    investment_type: str
    name: str
    invested_amount: int
    current_value: int
    returns_pct: float | None
    gain_loss: int = 0       # computed: current_value - invested_amount
    start_date: str | None
    maturity_date: str | None
    notes: str | None
    created_at: str

    class Config:
        from_attributes = True
