from datetime import date
from typing import Optional

from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.insurance import Insurance
from app.schemas.insurance import InsuranceCreate, InsuranceUpdate

_FREQ_TO_YEARLY = {
    'monthly':     12,
    'quarterly':    4,
    'half_yearly':  2,
    'yearly':       1,
}


def yearly_premium(amount: int, frequency: str) -> int:
    return amount * _FREQ_TO_YEARLY.get(frequency, 1)


def days_until_renewal(renewal_date: date) -> int:
    return max((renewal_date - date.today()).days, 0)


def _to_response(ins: Insurance) -> dict:
    today = date.today()
    return {
        'id':                ins.id,
        'insurance_type':    ins.insurance_type.value if hasattr(ins.insurance_type, 'value') else ins.insurance_type,
        'provider':          ins.provider,
        'policy_number':     ins.policy_number,
        'premium_amount':    ins.premium_amount,
        'premium_frequency': ins.premium_frequency,
        'renewal_date':      ins.renewal_date.isoformat(),
        'coverage_amount':   ins.coverage_amount,
        'nominee':           ins.nominee,
        'yearly_premium':    yearly_premium(ins.premium_amount, ins.premium_frequency),
        'days_until_renewal': days_until_renewal(ins.renewal_date),
        'is_expired':        ins.renewal_date < today,
        'created_at':        ins.created_at.isoformat(),
    }


def _get(db: Session, ins_id: int, user_id: int) -> Insurance:
    ins = db.query(Insurance).filter(
        Insurance.id == ins_id,
        Insurance.user_id == user_id,
    ).first()
    if not ins:
        raise HTTPException(status_code=404, detail='Policy not found')
    return ins


def get_all(db: Session, user_id: int) -> list[dict]:
    policies = (
        db.query(Insurance)
        .filter(Insurance.user_id == user_id)
        .order_by(Insurance.renewal_date)
        .all()
    )
    return [_to_response(p) for p in policies]


def get_one(db: Session, ins_id: int, user_id: int) -> dict:
    return _to_response(_get(db, ins_id, user_id))


def create(db: Session, user_id: int, data: InsuranceCreate) -> dict:
    ins = Insurance(
        user_id=user_id,
        insurance_type=data.insurance_type,
        provider=data.provider,
        policy_number=data.policy_number,
        premium_amount=data.premium_amount,
        premium_frequency=data.premium_frequency,
        renewal_date=data.renewal_date,
        coverage_amount=data.coverage_amount,
        nominee=data.nominee,
    )
    db.add(ins)
    db.commit()
    db.refresh(ins)
    return _to_response(ins)


def update(db: Session, ins_id: int, user_id: int, data: InsuranceUpdate) -> dict:
    ins = _get(db, ins_id, user_id)
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(ins, field, val)
    db.commit()
    db.refresh(ins)
    return _to_response(ins)


def delete(db: Session, ins_id: int, user_id: int) -> None:
    ins = _get(db, ins_id, user_id)
    db.delete(ins)
    db.commit()


def get_summary(db: Session, user_id: int) -> dict:
    today = date.today()
    policies = db.query(Insurance).filter(Insurance.user_id == user_id).all()
    active   = [p for p in policies if p.renewal_date >= today]

    total_yearly   = sum(yearly_premium(p.premium_amount, p.premium_frequency) for p in active)
    total_coverage = sum(p.coverage_amount or 0 for p in active)
    due_soon       = [_to_response(p) for p in active if days_until_renewal(p.renewal_date) <= 30]
    expired        = [_to_response(p) for p in policies if p.renewal_date < today]

    by_type: dict[str, dict] = {}
    for p in active:
        t = p.insurance_type.value if hasattr(p.insurance_type, 'value') else p.insurance_type
        if t not in by_type:
            by_type[t] = {'count': 0, 'yearly_premium': 0, 'coverage': 0}
        by_type[t]['count']          += 1
        by_type[t]['yearly_premium'] += yearly_premium(p.premium_amount, p.premium_frequency)
        by_type[t]['coverage']       += p.coverage_amount or 0

    return {
        'total_yearly_premium': total_yearly,
        'total_coverage':       total_coverage,
        'active_count':         len(active),
        'expired_count':        len(expired),
        'due_soon':             due_soon,
        'expired':              expired,
        'by_type':              by_type,
    }
