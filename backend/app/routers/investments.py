from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.investment import InvestmentCreate, InvestmentUpdate, InvestmentResponse
from app.services import investment_service

router = APIRouter(prefix="/investments", tags=["investments"])


@router.get("", response_model=list[InvestmentResponse])
async def list_investments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_to_response(i) for i in investment_service.get_investments(db, current_user.id)]


@router.get("/portfolio-summary")
async def portfolio_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return investment_service.get_portfolio_summary(db, current_user.id)


@router.post("", response_model=InvestmentResponse, status_code=201)
async def create_investment(
    data: InvestmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(investment_service.create_investment(db, current_user.id, data))


@router.get("/{investment_id}", response_model=InvestmentResponse)
async def get_investment(
    investment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(investment_service.get_investment(db, investment_id, current_user.id))


@router.put("/{investment_id}", response_model=InvestmentResponse)
async def update_investment(
    investment_id: int,
    data: InvestmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(investment_service.update_investment(db, investment_id, current_user.id, data))


@router.delete("/{investment_id}", status_code=204)
async def delete_investment(
    investment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    investment_service.delete_investment(db, investment_id, current_user.id)


def _to_response(inv) -> InvestmentResponse:
    return InvestmentResponse(
        id=inv.id,
        investment_type=inv.investment_type.value,
        name=inv.name,
        invested_amount=inv.invested_amount,
        current_value=inv.current_value,
        returns_pct=inv.returns_pct,
        gain_loss=inv.current_value - inv.invested_amount,
        start_date=inv.start_date.isoformat() if inv.start_date else None,
        maturity_date=inv.maturity_date.isoformat() if inv.maturity_date else None,
        notes=inv.notes,
        created_at=inv.created_at.isoformat(),
    )
