from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.insurance import Subscription
from app.schemas.subscription import SubscriptionCreate, SubscriptionUpdate

# months multiplier to convert per-cycle amount → monthly equivalent
_CYCLE_TO_MONTHS = {
    'weekly':      1 / 4.33,
    'monthly':     1,
    'quarterly':   3,
    'half_yearly': 6,
    'yearly':      12,
}


def monthly_equivalent(amount: int, billing_cycle: str) -> int:
    """Return paise/month regardless of billing cycle."""
    divisor = _CYCLE_TO_MONTHS.get(billing_cycle, 1)
    return int(round(amount / divisor))


def days_until(next_date: date) -> int:
    delta = (next_date - date.today()).days
    return max(delta, 0)


def _to_response(sub: Subscription) -> dict:
    return {
        'id':                 sub.id,
        'name':               sub.name,
        'amount':             sub.amount,
        'billing_cycle':      sub.billing_cycle,
        'next_billing_date':  sub.next_billing_date.isoformat(),
        'category':           sub.category,
        'is_active':          sub.is_active,
        'monthly_equivalent': monthly_equivalent(sub.amount, sub.billing_cycle),
        'days_until_billing': days_until(sub.next_billing_date),
        'created_at':         sub.created_at.isoformat(),
    }


def get_subscriptions(db: Session, user_id: int, active_only: bool = False) -> list[dict]:
    q = db.query(Subscription).filter(Subscription.user_id == user_id)
    if active_only:
        q = q.filter(Subscription.is_active == True)
    subs = q.order_by(Subscription.next_billing_date).all()
    return [_to_response(s) for s in subs]


def get_subscription(db: Session, sub_id: int, user_id: int) -> Subscription:
    sub = db.query(Subscription).filter(
        Subscription.id == sub_id,
        Subscription.user_id == user_id,
    ).first()
    if not sub:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail='Subscription not found')
    return sub


def create_subscription(db: Session, user_id: int, data: SubscriptionCreate) -> dict:
    sub = Subscription(
        user_id=user_id,
        name=data.name,
        amount=data.amount,
        billing_cycle=data.billing_cycle,
        next_billing_date=data.next_billing_date,
        category=data.category,
        is_active=data.is_active,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _to_response(sub)


def update_subscription(db: Session, sub_id: int, user_id: int, data: SubscriptionUpdate) -> dict:
    sub = get_subscription(db, sub_id, user_id)
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(sub, field, val)
    db.commit()
    db.refresh(sub)
    return _to_response(sub)


def delete_subscription(db: Session, sub_id: int, user_id: int) -> None:
    sub = get_subscription(db, sub_id, user_id)
    db.delete(sub)
    db.commit()


def advance_billing_date(db: Session, sub_id: int, user_id: int) -> dict:
    """Push next_billing_date forward by one billing cycle (mark as renewed)."""
    sub = get_subscription(db, sub_id, user_id)
    nd = sub.next_billing_date
    cycle = sub.billing_cycle
    if cycle == 'weekly':
        nd = nd + timedelta(weeks=1)
    elif cycle == 'monthly':
        month = nd.month + 1
        year  = nd.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        nd = nd.replace(year=year, month=month)
    elif cycle == 'quarterly':
        month = nd.month + 3
        year  = nd.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        nd = nd.replace(year=year, month=month)
    elif cycle == 'half_yearly':
        month = nd.month + 6
        year  = nd.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        nd = nd.replace(year=year, month=month)
    elif cycle == 'yearly':
        nd = nd.replace(year=nd.year + 1)
    sub.next_billing_date = nd
    db.commit()
    db.refresh(sub)
    return _to_response(sub)


def get_summary(db: Session, user_id: int) -> dict:
    """Return monthly spend totals by category for active subscriptions."""
    subs = db.query(Subscription).filter(
        Subscription.user_id == user_id,
        Subscription.is_active == True,
    ).all()

    total_monthly = sum(monthly_equivalent(s.amount, s.billing_cycle) for s in subs)
    total_yearly  = total_monthly * 12

    by_category: dict[str, int] = {}
    for s in subs:
        cat = s.category or 'Other'
        by_category[cat] = by_category.get(cat, 0) + monthly_equivalent(s.amount, s.billing_cycle)

    due_soon = [_to_response(s) for s in subs if days_until(s.next_billing_date) <= 7]

    return {
        'total_monthly':  total_monthly,
        'total_yearly':   total_yearly,
        'active_count':   len(subs),
        'by_category':    [{'category': k, 'monthly': v} for k, v in sorted(by_category.items(), key=lambda x: -x[1])],
        'due_soon':       due_soon,
    }
