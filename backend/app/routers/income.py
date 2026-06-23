from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.income import IncomeCreate, IncomeUpdate, IncomeResponse
from app.services import income_service

router = APIRouter(prefix="/income", tags=["income"])


@router.get("", response_model=dict)
async def list_income(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = income_service.get_incomes(db, current_user.id, page, limit, month, year)
    return {
        "data": [_to_response(i) for i in items],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", response_model=IncomeResponse, status_code=201)
async def create_income(
    data: IncomeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(income_service.create_income(db, current_user.id, data))


@router.get("/monthly-total")
async def monthly_total(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total = income_service.get_monthly_total(db, current_user.id, month, year)
    return {"month": month, "year": year, "total": total}


@router.get("/{income_id}", response_model=IncomeResponse)
async def get_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(income_service.get_income(db, income_id, current_user.id))


@router.put("/{income_id}", response_model=IncomeResponse)
async def update_income(
    income_id: int,
    data: IncomeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(income_service.update_income(db, income_id, current_user.id, data))


@router.delete("/{income_id}", status_code=204)
async def delete_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    income_service.delete_income(db, income_id, current_user.id)


def _to_response(i) -> IncomeResponse:
    return IncomeResponse(
        id=i.id,
        account_id=i.account_id,
        source_type=i.source_type.value,
        amount=i.amount,
        date=i.date.isoformat(),
        description=i.description,
        is_recurring=i.is_recurring,
        created_at=i.created_at.isoformat(),
    )
