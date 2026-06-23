from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.insurance import InsuranceCreate, InsuranceUpdate
from app.services import insurance_service

router = APIRouter(prefix="/insurance", tags=["insurance"])


@router.get("/summary")
async def summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return insurance_service.get_summary(db, current_user.id)


@router.get("")
async def list_policies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return insurance_service.get_all(db, current_user.id)


@router.post("", status_code=201)
async def create_policy(
    data: InsuranceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return insurance_service.create(db, current_user.id, data)


@router.get("/{ins_id}")
async def get_policy(
    ins_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return insurance_service.get_one(db, ins_id, current_user.id)


@router.put("/{ins_id}")
async def update_policy(
    ins_id: int,
    data: InsuranceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return insurance_service.update(db, ins_id, current_user.id, data)


@router.delete("/{ins_id}", status_code=204)
async def delete_policy(
    ins_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    insurance_service.delete(db, ins_id, current_user.id)
