from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalUpdate, GoalResponse
from app.services import goal_service

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("", response_model=list[GoalResponse])
async def list_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_to_response(g) for g in goal_service.get_goals(db, current_user.id)]


@router.post("", response_model=GoalResponse, status_code=201)
async def create_goal(
    data: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(goal_service.create_goal(db, current_user.id, data))


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(goal_service.get_goal(db, goal_id, current_user.id))


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: int,
    data: GoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(goal_service.update_goal(db, goal_id, current_user.id, data))


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal_service.delete_goal(db, goal_id, current_user.id)


def _to_response(g) -> GoalResponse:
    pct = round((g.current_amount / g.target_amount * 100), 1) if g.target_amount > 0 else 0.0
    return GoalResponse(
        id=g.id,
        goal_type=g.goal_type.value,
        name=g.name,
        target_amount=g.target_amount,
        current_amount=g.current_amount,
        progress_pct=pct,
        target_date=g.target_date.isoformat() if g.target_date else None,
        monthly_contribution=g.monthly_contribution,
        priority=g.priority,
        status=g.status.value,
        created_at=g.created_at.isoformat(),
    )
