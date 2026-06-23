from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.services import health_score_service

router = APIRouter(prefix="/health-score", tags=["health-score"])


@router.get("")
async def get_health_score(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compute (or retrieve today's cached) financial health score."""
    return health_score_service.compute_score(db, current_user.id)
