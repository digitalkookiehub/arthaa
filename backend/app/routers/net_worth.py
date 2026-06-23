from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.net_worth import NetWorthResponse, NetWorthHistoryItem
from app.services import net_worth_service

router = APIRouter(prefix="/net-worth", tags=["net-worth"])


@router.get("/latest", response_model=NetWorthResponse)
async def get_net_worth(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return net_worth_service.calculate_net_worth(db, current_user.id)


@router.post("/snapshot", response_model=NetWorthResponse)
async def take_snapshot(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    net_worth_service.snapshot_net_worth(db, current_user.id)
    return net_worth_service.calculate_net_worth(db, current_user.id)


@router.get("/history", response_model=list[NetWorthHistoryItem])
async def get_history(
    months: int = Query(12, ge=1, le=60),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return net_worth_service.get_net_worth_history(db, current_user.id, months)
