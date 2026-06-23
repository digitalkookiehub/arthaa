import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, ForbiddenError, ConflictError
from app.models.budget import Budget
from app.models.expense import Expense
from app.schemas.budget import BudgetCreate, BudgetUpdate, BudgetResponse

logger = logging.getLogger(__name__)


def get_budgets(db: Session, user_id: int, month: int, year: int) -> list[BudgetResponse]:
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == user_id, Budget.month == month, Budget.year == year)
        .all()
    )
    result = []
    for b in budgets:
        spent = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
            Expense.user_id == user_id,
            Expense.category_id == b.category_id,
            func.extract("month", Expense.date) == month,
            func.extract("year", Expense.date) == year,
        ).scalar()
        spent = int(spent)
        remaining = max(0, b.budgeted_amount - spent)
        pct = round((spent / b.budgeted_amount * 100), 1) if b.budgeted_amount > 0 else 0.0
        result.append(BudgetResponse(
            id=b.id,
            month=b.month,
            year=b.year,
            category_id=b.category_id,
            budgeted_amount=b.budgeted_amount,
            spent_amount=spent,
            remaining_amount=remaining,
            utilization_pct=pct,
        ))
    return result


def create_budget(db: Session, user_id: int, data: BudgetCreate) -> Budget:
    existing = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.month == data.month,
        Budget.year == data.year,
        Budget.category_id == data.category_id,
    ).first()
    if existing:
        raise ConflictError("Budget for this category and month already exists")
    b = Budget(user_id=user_id, **data.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


def update_budget(db: Session, budget_id: int, user_id: int, data: BudgetUpdate) -> Budget:
    b = db.query(Budget).filter(Budget.id == budget_id).first()
    if not b:
        raise NotFoundError("Budget")
    if b.user_id != user_id:
        raise ForbiddenError()
    b.budgeted_amount = data.budgeted_amount
    db.commit()
    db.refresh(b)
    return b


def delete_budget(db: Session, budget_id: int, user_id: int) -> None:
    b = db.query(Budget).filter(Budget.id == budget_id).first()
    if not b:
        raise NotFoundError("Budget")
    if b.user_id != user_id:
        raise ForbiddenError()
    db.delete(b)
    db.commit()
