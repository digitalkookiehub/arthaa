import logging

from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, ForbiddenError
from app.models.goal import Goal
from app.schemas.goal import GoalCreate, GoalUpdate

logger = logging.getLogger(__name__)


def get_goals(db: Session, user_id: int) -> list[Goal]:
    return db.query(Goal).filter(Goal.user_id == user_id).order_by(Goal.priority).all()


def get_goal(db: Session, goal_id: int, user_id: int) -> Goal:
    g = db.query(Goal).filter(Goal.id == goal_id).first()
    if not g:
        raise NotFoundError("Goal")
    if g.user_id != user_id:
        raise ForbiddenError()
    return g


def create_goal(db: Session, user_id: int, data: GoalCreate) -> Goal:
    g = Goal(user_id=user_id, **data.model_dump())
    db.add(g)
    db.commit()
    db.refresh(g)
    logger.info("Goal created: %s for user %s", g.id, user_id)
    return g


def update_goal(db: Session, goal_id: int, user_id: int, data: GoalUpdate) -> Goal:
    g = get_goal(db, goal_id, user_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(g, field, value)
    db.commit()
    db.refresh(g)
    return g


def delete_goal(db: Session, goal_id: int, user_id: int) -> None:
    g = get_goal(db, goal_id, user_id)
    db.delete(g)
    db.commit()
