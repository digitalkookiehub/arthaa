import logging
from datetime import date

from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, ForbiddenError
from app.models.asset import Asset, AssetValueHistory
from app.schemas.asset import AssetCreate, AssetUpdate

logger = logging.getLogger(__name__)


def get_assets(db: Session, user_id: int) -> list[Asset]:
    return db.query(Asset).filter(Asset.user_id == user_id).all()


def get_asset(db: Session, asset_id: int, user_id: int) -> Asset:
    a = db.query(Asset).filter(Asset.id == asset_id).first()
    if not a:
        raise NotFoundError("Asset")
    if a.user_id != user_id:
        raise ForbiddenError()
    return a


def create_asset(db: Session, user_id: int, data: AssetCreate) -> Asset:
    a = Asset(user_id=user_id, **data.model_dump())
    db.add(a)
    db.flush()
    db.add(AssetValueHistory(asset_id=a.id, value=a.current_value, recorded_date=date.today()))
    db.commit()
    db.refresh(a)
    logger.info("Asset created: %s for user %s", a.id, user_id)
    return a


def update_asset(db: Session, asset_id: int, user_id: int, data: AssetUpdate) -> Asset:
    a = get_asset(db, asset_id, user_id)
    old_value = a.current_value
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(a, field, value)
    if data.current_value and data.current_value != old_value:
        db.add(AssetValueHistory(asset_id=a.id, value=data.current_value, recorded_date=date.today()))
    db.commit()
    db.refresh(a)
    return a


def delete_asset(db: Session, asset_id: int, user_id: int) -> None:
    a = get_asset(db, asset_id, user_id)
    db.delete(a)
    db.commit()
