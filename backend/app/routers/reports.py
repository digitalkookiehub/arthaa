from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.services import reports_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/cash-flow")
async def cash_flow(
    year:   int  = Query(default=None),
    fiscal: bool = Query(default=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if year is None:
        today = date.today()
        year  = today.year if not fiscal else (today.year if today.month >= 4 else today.year - 1)
    return reports_service.cash_flow_report(db, current_user.id, year, fiscal)


@router.get("/expenses")
async def expense_breakdown(
    from_date: date = Query(...),
    to_date:   date = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return reports_service.expense_report(db, current_user.id, from_date, to_date)


@router.get("/net-worth-trend")
async def net_worth_trend(
    months: int = Query(default=12, ge=3, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return reports_service.net_worth_report(db, current_user.id, months)


@router.get("/tax")
async def tax_summary(
    fy: int = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if fy is None:
        today = date.today()
        fy    = today.year if today.month >= 4 else today.year - 1
    return reports_service.tax_report(db, current_user.id, fy)
