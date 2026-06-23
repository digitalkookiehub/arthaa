import logging
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.asset import Asset
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.net_worth_history import NetWorthHistory
from app.schemas.net_worth import NetWorthResponse, NetWorthHistoryItem

logger = logging.getLogger(__name__)


def calculate_net_worth(db: Session, user_id: int) -> NetWorthResponse:
    account_balance = db.query(func.coalesce(func.sum(Account.balance), 0)).filter(
        Account.user_id == user_id, Account.is_active == True  # noqa: E712
    ).scalar()

    investment_value = db.query(func.coalesce(func.sum(Investment.current_value), 0)).filter(
        Investment.user_id == user_id
    ).scalar()

    asset_value = db.query(func.coalesce(func.sum(Asset.current_value), 0)).filter(
        Asset.user_id == user_id
    ).scalar()

    loan_balance = db.query(func.coalesce(func.sum(Loan.outstanding_balance), 0)).filter(
        Loan.user_id == user_id
    ).scalar()

    total_assets = int(account_balance) + int(investment_value) + int(asset_value)
    total_liabilities = int(loan_balance)
    net_worth = total_assets - total_liabilities

    return NetWorthResponse(
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        net_worth=net_worth,
        recorded_date=date.today().isoformat(),
        total_account_balance=int(account_balance),
        total_investment_value=int(investment_value),
        total_asset_value=int(asset_value),
        total_outstanding_loans=int(loan_balance),
    )


def snapshot_net_worth(db: Session, user_id: int) -> NetWorthHistory:
    data = calculate_net_worth(db, user_id)
    today = date.today()

    existing = db.query(NetWorthHistory).filter(
        NetWorthHistory.user_id == user_id,
        NetWorthHistory.recorded_date == today,
    ).first()

    if existing:
        existing.total_assets = data.total_assets
        existing.total_liabilities = data.total_liabilities
        existing.net_worth = data.net_worth
        db.commit()
        db.refresh(existing)
        return existing

    snap = NetWorthHistory(
        user_id=user_id,
        total_assets=data.total_assets,
        total_liabilities=data.total_liabilities,
        net_worth=data.net_worth,
        recorded_date=today,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    logger.info("Net worth snapshot for user %s: %s paise", user_id, data.net_worth)
    return snap


def get_net_worth_history(db: Session, user_id: int, months: int = 12) -> list[NetWorthHistoryItem]:
    rows = (
        db.query(NetWorthHistory)
        .filter(NetWorthHistory.user_id == user_id)
        .order_by(NetWorthHistory.recorded_date.desc())
        .limit(months)
        .all()
    )
    return [
        NetWorthHistoryItem(
            total_assets=r.total_assets,
            total_liabilities=r.total_liabilities,
            net_worth=r.net_worth,
            recorded_date=r.recorded_date.isoformat(),
        )
        for r in reversed(rows)
    ]
