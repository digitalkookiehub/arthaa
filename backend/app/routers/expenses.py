from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.expense import (
    ExpenseCreate, ExpenseUpdate, ExpenseResponse,
    ExpenseCategoryResponse, ExpenseFilters,
)
from app.services import expense_service

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("/categories", response_model=list[ExpenseCategoryResponse])
async def list_categories(db: Session = Depends(get_db)):
    return expense_service.get_categories(db)


@router.get("", response_model=dict)
async def list_expenses(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000),
    category_id: int | None = None,
    account_id: int | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filters = ExpenseFilters(
        page=page, limit=limit, month=month, year=year,
        category_id=category_id, account_id=account_id, search=search,
    )
    items, total = expense_service.get_expenses(db, current_user.id, filters)
    return {
        "data": [_to_response(e) for e in items],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    data: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(expense_service.create_expense(db, current_user.id, data))


@router.get("/monthly-total")
async def monthly_total(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total = expense_service.get_monthly_total(db, current_user.id, month, year)
    return {"month": month, "year": year, "total": total}


@router.get("/category-totals")
async def category_totals(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return expense_service.get_category_totals(db, current_user.id, month, year)


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(expense_service.get_expense(db, expense_id, current_user.id))


@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: int,
    data: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(expense_service.update_expense(db, expense_id, current_user.id, data))


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense_service.delete_expense(db, expense_id, current_user.id)


def _to_response(e) -> ExpenseResponse:
    return ExpenseResponse(
        id=e.id,
        account_id=e.account_id,
        category_id=e.category_id,
        category=ExpenseCategoryResponse(
            id=e.category.id,
            name=e.category.name,
            icon=e.category.icon,
            color=e.category.color,
            is_system=e.category.is_system,
        ) if e.category else None,
        date=e.date.isoformat(),
        amount=e.amount,
        description=e.description,
        subcategory=e.subcategory,
        payment_method=e.payment_method.value if e.payment_method else None,
        location=e.location,
        tags=e.tags or [],
        is_recurring=e.is_recurring,
        bill_attachment_url=e.bill_attachment_url,
        created_at=e.created_at.isoformat(),
    )
