from datetime import date
from pydantic import BaseModel
from app.models.goal import GoalType, GoalStatus


class GoalCreate(BaseModel):
    goal_type: GoalType
    name: str
    target_amount: int           # paise
    current_amount: int = 0      # paise
    target_date: date | None = None
    monthly_contribution: int | None = None  # paise
    priority: int = 3            # 1-5


class GoalUpdate(BaseModel):
    name: str | None = None
    target_amount: int | None = None
    current_amount: int | None = None
    target_date: date | None = None
    monthly_contribution: int | None = None
    priority: int | None = None
    status: GoalStatus | None = None


class GoalResponse(BaseModel):
    id: int
    goal_type: str
    name: str
    target_amount: int
    current_amount: int
    progress_pct: float = 0.0    # computed
    target_date: str | None
    monthly_contribution: int | None
    priority: int
    status: str
    created_at: str

    class Config:
        from_attributes = True
