import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, ForbiddenError
from app.models.investment import Investment
from app.schemas.investment import InvestmentCreate, InvestmentUpdate

logger = logging.getLogger(__name__)


def get_investments(db: Session, user_id: int) -> list[Investment]:
    return db.query(Investment).filter(Investment.user_id == user_id).all()


def get_investment(db: Session, investment_id: int, user_id: int) -> Investment:
    inv = db.query(Investment).filter(Investment.id == investment_id).first()
    if not inv:
        raise NotFoundError("Investment")
    if inv.user_id != user_id:
        raise ForbiddenError()
    return inv


def create_investment(db: Session, user_id: int, data: InvestmentCreate) -> Investment:
    inv = Investment(user_id=user_id, **data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    logger.info("Investment created: %s for user %s", inv.id, user_id)
    return inv


def update_investment(db: Session, investment_id: int, user_id: int, data: InvestmentUpdate) -> Investment:
    inv = get_investment(db, investment_id, user_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(inv, field, value)
    db.commit()
    db.refresh(inv)
    return inv


def delete_investment(db: Session, investment_id: int, user_id: int) -> None:
    inv = get_investment(db, investment_id, user_id)
    db.delete(inv)
    db.commit()


def get_portfolio_summary(db: Session, user_id: int) -> dict:
    rows = db.query(
        Investment.investment_type,
        func.coalesce(func.sum(Investment.invested_amount), 0).label("invested"),
        func.coalesce(func.sum(Investment.current_value), 0).label("current"),
    ).filter(Investment.user_id == user_id).group_by(Investment.investment_type).all()

    total_invested = sum(int(r.invested) for r in rows)
    total_current = sum(int(r.current) for r in rows)
    return {
        "total_invested": total_invested,
        "total_current_value": total_current,
        "total_gain_loss": total_current - total_invested,
        "by_type": [
            {
                "type": r.investment_type,
                "invested": int(r.invested),
                "current_value": int(r.current),
                "gain_loss": int(r.current) - int(r.invested),
            }
            for r in rows
        ],
    }
