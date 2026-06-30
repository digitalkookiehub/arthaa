import logging

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.exceptions import NotFoundError, ForbiddenError
from app.models.expense import Expense, ExpenseCategory
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseFilters

logger = logging.getLogger(__name__)


def get_categories(db: Session) -> list[ExpenseCategory]:
    return db.query(ExpenseCategory).order_by(ExpenseCategory.name).all()


def get_expenses(db: Session, user_id: int, filters: ExpenseFilters) -> tuple[list[Expense], int]:
    q = (
        db.query(Expense)
        .options(joinedload(Expense.category))
        .filter(Expense.user_id == user_id)
    )
    if filters.from_date:
        q = q.filter(Expense.date >= filters.from_date)
    if filters.to_date:
        q = q.filter(Expense.date <= filters.to_date)
    if not filters.from_date and not filters.to_date:
        if filters.month:
            q = q.filter(func.extract("month", Expense.date) == filters.month)
        if filters.year:
            q = q.filter(func.extract("year", Expense.date) == filters.year)
    if filters.category_id:
        q = q.filter(Expense.category_id == filters.category_id)
    if filters.account_id:
        q = q.filter(Expense.account_id == filters.account_id)
    if filters.search:
        q = q.filter(Expense.description.ilike(f"%{filters.search}%"))

    total = q.count()
    items = (
        q.order_by(Expense.date.desc(), Expense.id.desc())
        .offset((filters.page - 1) * filters.limit)
        .limit(filters.limit)
        .all()
    )
    return items, total


def get_expense(db: Session, expense_id: int, user_id: int) -> Expense:
    exp = db.query(Expense).options(joinedload(Expense.category)).filter(Expense.id == expense_id).first()
    if not exp:
        raise NotFoundError("Expense")
    if exp.user_id != user_id:
        raise ForbiddenError()
    return exp


def create_expense(db: Session, user_id: int, data: ExpenseCreate) -> Expense:
    exp = Expense(user_id=user_id, **data.model_dump())
    db.add(exp)
    db.commit()
    db.refresh(exp)
    logger.info("Expense created: %s for user %s", exp.id, user_id)
    return exp


def update_expense(db: Session, expense_id: int, user_id: int, data: ExpenseUpdate) -> Expense:
    exp = get_expense(db, expense_id, user_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(exp, field, value)
    db.commit()
    db.refresh(exp)
    return exp


def delete_expense(db: Session, expense_id: int, user_id: int) -> None:
    exp = get_expense(db, expense_id, user_id)
    db.delete(exp)
    db.commit()


def get_monthly_total(db: Session, user_id: int, month: int, year: int) -> int:
    result = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
        Expense.user_id == user_id,
        func.extract("month", Expense.date) == month,
        func.extract("year", Expense.date) == year,
    ).scalar()
    return int(result)


def get_category_totals(db: Session, user_id: int, month: int, year: int) -> list[dict]:
    rows = (
        db.query(
            ExpenseCategory.id,
            ExpenseCategory.name,
            ExpenseCategory.color,
            ExpenseCategory.icon,
            func.coalesce(func.sum(Expense.amount), 0).label("total"),
        )
        .join(Expense, Expense.category_id == ExpenseCategory.id, isouter=True)
        .filter(
            Expense.user_id == user_id,
            func.extract("month", Expense.date) == month,
            func.extract("year", Expense.date) == year,
        )
        .group_by(ExpenseCategory.id)
        .order_by(func.sum(Expense.amount).desc())
        .all()
    )
    return [
        {"id": r.id, "name": r.name, "color": r.color, "icon": r.icon, "total": int(r.total)}
        for r in rows
    ]
