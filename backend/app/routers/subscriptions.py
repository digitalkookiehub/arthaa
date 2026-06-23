from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.subscription import SubscriptionCreate, SubscriptionUpdate
from app.services import subscription_service

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("/summary")
async def get_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return subscription_service.get_summary(db, current_user.id)


@router.get("")
async def list_subscriptions(
    active_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return subscription_service.get_subscriptions(db, current_user.id, active_only)


@router.post("", status_code=201)
async def create_subscription(
    data: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return subscription_service.create_subscription(db, current_user.id, data)


@router.put("/{sub_id}")
async def update_subscription(
    sub_id: int,
    data: SubscriptionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return subscription_service.update_subscription(db, sub_id, current_user.id, data)


@router.delete("/{sub_id}", status_code=204)
async def delete_subscription(
    sub_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subscription_service.delete_subscription(db, sub_id, current_user.id)


@router.post("/{sub_id}/renew")
async def mark_renewed(
    sub_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Advance next_billing_date by one cycle (call when payment is made)."""
    return subscription_service.advance_billing_date(db, sub_id, current_user.id)
