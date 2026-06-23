"""
Financial Calendar router.

Returns all upcoming (and recent past) financial events for the user:
credit card due dates, loan EMI dates, subscription renewals,
insurance renewals, goal target dates, budget start/end.

No new model needed — events are derived from existing data in real time.
"""
import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.services import calendar_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events")
async def get_events(
    from_date: date = Query(default=None),
    to_date:   date = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all financial events in the given date range."""
    today = date.today()
    if from_date is None:
        from_date = date(today.year, today.month, 1)          # start of current month
    if to_date is None:
        # three months ahead
        y, m = today.year, today.month + 2
        if m > 12:
            m -= 12
            y += 1
        last = [31,28,31,30,31,30,31,31,30,31,30,31][m-1]
        if m == 2 and (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)):
            last = 29
        to_date = date(y, m, last)

    events = calendar_service.get_events(db, current_user.id, from_date, to_date)
    return {"events": events, "from_date": from_date.isoformat(), "to_date": to_date.isoformat()}


@router.get("/upcoming")
async def get_upcoming(
    days: int = Query(default=30, ge=7, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return events in the next N days, sorted by date."""
    today = date.today()
    events = calendar_service.get_events(db, current_user.id, today, today + timedelta(days=days))
    events.sort(key=lambda e: e["date"])
    return {"events": events, "days": days}
