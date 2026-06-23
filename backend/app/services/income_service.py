import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, ForbiddenError
from app.models.income import Income
from app.schemas.income import IncomeCreate, IncomeUpdate

logger = logging.getLogger(__name__)


def get_incomes(
    db: Session, user_id: int, page: int = 1, limit: int = 20,
    month: int | None = None, year: int | None = None,
) -> tuple[list[Income], int]:
    q = db.query(Income).filter(Income.user_id == user_id)
    if month:
        q = q.filter(func.extract("month", Income.date) == month)
    if year:
        q = q.filter(func.extract("year", Income.date) == year)
    total = q.count()
    items = q.order_by(Income.date.desc()).offset((page - 1) * limit).limit(limit).all()
    return items, total


def get_income(db: Session, income_id: int, user_id: int) -> Income:
    inc = db.query(Income).filter(Income.id == income_id).first()
    if not inc:
        raise NotFoundError("Income")
    if inc.user_id != user_id:
        raise ForbiddenError()
    return inc


def create_income(db: Session, user_id: int, data: IncomeCreate) -> Income:
    inc = Income(user_id=user_id, **data.model_dump())
    db.add(inc)
    db.commit()
    db.refresh(inc)
    logger.info("Income created: %s for user %s", inc.id, user_id)
    return inc


def update_income(db: Session, income_id: int, user_id: int, data: IncomeUpdate) -> Income:
    inc = get_income(db, income_id, user_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(inc, field, value)
    db.commit()
    db.refresh(inc)
    return inc


def delete_income(db: Session, income_id: int, user_id: int) -> None:
    inc = get_income(db, income_id, user_id)
    db.delete(inc)
    db.commit()


def get_monthly_total(db: Session, user_id: int, month: int, year: int) -> int:
    result = db.query(func.coalesce(func.sum(Income.amount), 0)).filter(
        Income.user_id == user_id,
        func.extract("month", Income.date) == month,
        func.extract("year", Income.date) == year,
    ).scalar()
    return int(result)
