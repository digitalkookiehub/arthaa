from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.budget import BudgetCreate, BudgetUpdate, BudgetResponse
from app.services import budget_service

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetResponse])
async def list_budgets(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return budget_service.get_budgets(db, current_user.id, month, year)


@router.post("", response_model=BudgetResponse, status_code=201)
async def create_budget(
    data: BudgetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    b = budget_service.create_budget(db, current_user.id, data)
    return BudgetResponse(
        id=b.id, month=b.month, year=b.year,
        category_id=b.category_id, budgeted_amount=b.budgeted_amount,
    )


@router.put("/{budget_id}", response_model=BudgetResponse)
async def update_budget(
    budget_id: int,
    data: BudgetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    b = budget_service.update_budget(db, budget_id, current_user.id, data)
    return BudgetResponse(
        id=b.id, month=b.month, year=b.year,
        category_id=b.category_id, budgeted_amount=b.budgeted_amount,
    )


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    budget_service.delete_budget(db, budget_id, current_user.id)
