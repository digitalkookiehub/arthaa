import calendar
import logging
from datetime import date

from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, ForbiddenError
from app.models.credit_card import CreditCard, CreditCardTransaction
from app.schemas.credit_card import CreditCardCreate, CreditCardUpdate, TransactionCreate

logger = logging.getLogger(__name__)


def _days_until_due(due_day: int | None) -> int | None:
    if not due_day:
        return None
    today = date.today()
    max_day = calendar.monthrange(today.year, today.month)[1]
    this_due = date(today.year, today.month, min(due_day, max_day))
    if this_due >= today:
        return (this_due - today).days
    # Move to next month
    if today.month == 12:
        nm_year, nm_month = today.year + 1, 1
    else:
        nm_year, nm_month = today.year, today.month + 1
    next_max = calendar.monthrange(nm_year, nm_month)[1]
    next_due = date(nm_year, nm_month, min(due_day, next_max))
    return (next_due - today).days


def _utilization(card: CreditCard) -> float:
    if not card.credit_limit:
        return 0.0
    return round(card.outstanding_balance / card.credit_limit * 100, 1)


def get_cards(db: Session, user_id: int) -> list[CreditCard]:
    return db.query(CreditCard).filter(CreditCard.user_id == user_id).all()


def get_card(db: Session, card_id: int, user_id: int) -> CreditCard:
    card = db.query(CreditCard).filter(CreditCard.id == card_id).first()
    if not card:
        raise NotFoundError("CreditCard")
    if card.user_id != user_id:
        raise ForbiddenError()
    return card


def create_card(db: Session, user_id: int, data: CreditCardCreate) -> CreditCard:
    card = CreditCard(
        user_id=user_id,
        card_name=data.card_name,
        bank_name=data.bank_name,
        last4_digits=data.last4_digits,
        credit_limit=data.credit_limit,
        outstanding_balance=data.outstanding_balance,
        due_date=data.due_date,
        minimum_due=data.minimum_due,
        interest_rate=data.interest_rate,
        rewards_points=data.rewards_points,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    logger.info("Credit card created: %s for user %s", card.id, user_id)
    return card


def update_card(db: Session, card_id: int, user_id: int, data: CreditCardUpdate) -> CreditCard:
    card = get_card(db, card_id, user_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(card, field, value)
    db.commit()
    db.refresh(card)
    return card


def delete_card(db: Session, card_id: int, user_id: int) -> None:
    card = get_card(db, card_id, user_id)
    db.delete(card)
    db.commit()
    logger.info("Credit card deleted: %s", card_id)


def get_transactions(
    db: Session, card_id: int, user_id: int,
    month: int | None = None, year: int | None = None,
) -> list[CreditCardTransaction]:
    get_card(db, card_id, user_id)
    q = db.query(CreditCardTransaction).filter(CreditCardTransaction.credit_card_id == card_id)
    if month and year:
        q = q.filter(
            CreditCardTransaction.date >= date(year, month, 1),
            CreditCardTransaction.date <= date(year, month, calendar.monthrange(year, month)[1]),
        )
    return q.order_by(CreditCardTransaction.date.desc()).all()


def add_transaction(db: Session, card_id: int, user_id: int, data: TransactionCreate) -> CreditCardTransaction:
    card = get_card(db, card_id, user_id)
    txn = CreditCardTransaction(
        credit_card_id=card.id,
        amount=data.amount,
        description=data.description,
        date=data.date,
        category_id=data.category_id,
        is_payment=data.is_payment,
    )
    db.add(txn)
    # Update outstanding balance
    if data.is_payment:
        card.outstanding_balance = max(0, card.outstanding_balance - data.amount)
    else:
        card.outstanding_balance = min(card.credit_limit, card.outstanding_balance + data.amount)
    db.commit()
    db.refresh(txn)
    logger.info("CC transaction added: card=%s amount=%s payment=%s", card_id, data.amount, data.is_payment)
    return txn


def delete_transaction(db: Session, card_id: int, txn_id: int, user_id: int) -> None:
    card = get_card(db, card_id, user_id)
    txn = db.query(CreditCardTransaction).filter(
        CreditCardTransaction.id == txn_id,
        CreditCardTransaction.credit_card_id == card.id,
    ).first()
    if not txn:
        raise NotFoundError("Transaction")
    # Reverse the balance effect
    if txn.is_payment:
        card.outstanding_balance = min(card.credit_limit, card.outstanding_balance + txn.amount)
    else:
        card.outstanding_balance = max(0, card.outstanding_balance - txn.amount)
    db.delete(txn)
    db.commit()
