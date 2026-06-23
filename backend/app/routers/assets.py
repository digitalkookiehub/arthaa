from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.asset import AssetCreate, AssetUpdate, AssetResponse
from app.services import asset_service

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("", response_model=list[AssetResponse])
async def list_assets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_to_response(a) for a in asset_service.get_assets(db, current_user.id)]


@router.post("", response_model=AssetResponse, status_code=201)
async def create_asset(
    data: AssetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(asset_service.create_asset(db, current_user.id, data))


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(asset_service.get_asset(db, asset_id, current_user.id))


@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: int,
    data: AssetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(asset_service.update_asset(db, asset_id, current_user.id, data))


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    asset_service.delete_asset(db, asset_id, current_user.id)


def _to_response(a) -> AssetResponse:
    return AssetResponse(
        id=a.id,
        asset_type=a.asset_type.value,
        name=a.name,
        purchase_value=a.purchase_value,
        current_value=a.current_value,
        appreciation=a.current_value - a.purchase_value,
        purchase_date=a.purchase_date.isoformat() if a.purchase_date else None,
        notes=a.notes,
        created_at=a.created_at.isoformat(),
    )
