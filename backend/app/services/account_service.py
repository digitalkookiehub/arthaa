import logging

from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, ForbiddenError
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountUpdate

logger = logging.getLogger(__name__)


def get_accounts(db: Session, user_id: int) -> list[Account]:
    return db.query(Account).filter(Account.user_id == user_id, Account.is_active == True).all()  # noqa: E712


def get_account(db: Session, account_id: int, user_id: int) -> Account:
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise NotFoundError("Account")
    if acc.user_id != user_id:
        raise ForbiddenError()
    return acc


def create_account(db: Session, user_id: int, data: AccountCreate) -> Account:
    acc = Account(user_id=user_id, **data.model_dump())
    db.add(acc)
    db.commit()
    db.refresh(acc)
    logger.info("Account created: %s for user %s", acc.id, user_id)
    return acc


def update_account(db: Session, account_id: int, user_id: int, data: AccountUpdate) -> Account:
    acc = get_account(db, account_id, user_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(acc, field, value)
    db.commit()
    db.refresh(acc)
    return acc


def delete_account(db: Session, account_id: int, user_id: int) -> None:
    acc = get_account(db, account_id, user_id)
    acc.is_active = False
    db.commit()
    logger.info("Account soft-deleted: %s", account_id)
