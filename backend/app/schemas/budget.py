from pydantic import BaseModel


class BudgetCreate(BaseModel):
    month: int
    year: int
    category_id: int
    budgeted_amount: int  # paise


class BudgetUpdate(BaseModel):
    budgeted_amount: int


class BudgetResponse(BaseModel):
    id: int
    month: int
    year: int
    category_id: int
    budgeted_amount: int
    spent_amount: int = 0      # computed — paise
    remaining_amount: int = 0  # computed — paise
    utilization_pct: float = 0.0

    class Config:
        from_attributes = True
