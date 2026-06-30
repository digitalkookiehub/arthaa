from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.income import IncomeSourceType
from app.models.user import User
from app.schemas.income import IncomeCreate, IncomeUpdate, IncomeResponse
from app.services import income_service
from app.services.salary_slip_parser import parse_salary_slip

router = APIRouter(prefix="/income", tags=["income"])


@router.get("", response_model=dict)
async def list_income(
    page: int = Query(1, ge=1),
    limit: int = Query(200, ge=1, le=500),
    from_date: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    to_date: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    parsed_from = date_type.fromisoformat(from_date) if from_date else None
    parsed_to   = date_type.fromisoformat(to_date)   if to_date   else None
    items, total = income_service.get_incomes(
        db, current_user.id, page, limit, month, year, parsed_from, parsed_to
    )
    return {
        "data": [_to_response(i) for i in items],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", response_model=IncomeResponse, status_code=201)
async def create_income(
    data: IncomeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(income_service.create_income(db, current_user.id, data))


@router.get("/monthly-total")
async def monthly_total(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total = income_service.get_monthly_total(db, current_user.id, month, year)
    return {"month": month, "year": year, "total": total}


@router.get("/{income_id}", response_model=IncomeResponse)
async def get_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(income_service.get_income(db, income_id, current_user.id))


@router.put("/{income_id}", response_model=IncomeResponse)
async def update_income(
    income_id: int,
    data: IncomeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(income_service.update_income(db, income_id, current_user.id, data))


@router.delete("/remove-bank-imports", status_code=200)
async def remove_bank_statement_income(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete all income records imported from bank statements (those without salary slip data)."""
    from app.models.income import Income

    # Bank-statement income has no gross pay, no deductions, and no total deductions —
    # all three are null only on records imported from bank statement (not salary slips).
    records = db.query(Income).filter(
        Income.user_id == current_user.id,
        Income.gross_pay_paise.is_(None),
        Income.total_deductions_paise.is_(None),
    ).all()

    removed = len(records)
    for r in records:
        db.delete(r)
    db.commit()
    return {'removed': removed}


@router.delete("/remove-duplicates", status_code=200)
async def remove_duplicate_salaries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete duplicate salary records — keeps the earliest record per date, removes the rest."""
    from app.models.income import Income
    from sqlalchemy import func

    dup_dates = (
        db.query(Income.date)
        .filter(Income.user_id == current_user.id, Income.source_type == IncomeSourceType.salary)
        .group_by(Income.date)
        .having(func.count(Income.id) > 1)
        .all()
    )

    removed = 0
    for (dup_date,) in dup_dates:
        records = (
            db.query(Income)
            .filter(
                Income.user_id == current_user.id,
                Income.source_type == IncomeSourceType.salary,
                Income.date == dup_date,
            )
            .order_by(Income.id.asc())
            .all()
        )
        for record in records[1:]:
            db.delete(record)
            removed += 1

    db.commit()
    return {'removed': removed}


@router.delete("/{income_id}", status_code=204)
async def delete_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    income_service.delete_income(db, income_id, current_user.id)


class SlipImportRow(BaseModel):
    net_pay_paise:          int
    gross_pay_paise:        int | None = None
    total_deductions_paise: int | None = None
    deductions:             list[dict]  = []
    pay_date:               str
    employer:               str | None = None
    employee:               str | None = None
    description:            str | None = None


class SlipImportRequest(BaseModel):
    slips: list[SlipImportRow]


@router.post("/parse-slip")
async def parse_slip(
    file: UploadFile = File(...),
    password: str = Form(default=''),
    current_user: User = Depends(get_current_user),
):
    """Parse a single salary slip PDF and return extracted fields for preview."""
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, 'File too large (max 20 MB)')
    result = parse_salary_slip(content, file.filename or 'slip.pdf', password or None)
    if result.get('error'):
        raise HTTPException(400, result['error'])
    return result


@router.post("/import-slips", status_code=201)
async def import_slips(
    body: SlipImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk-import confirmed salary slip data into the income table."""
    from datetime import date as date_type
    from sqlalchemy import func
    from app.models.income import Income

    imported  = 0
    skipped   = 0
    duplicate = 0

    for slip in body.slips:
        try:
            pay_date = date_type.fromisoformat(slip.pay_date)
        except ValueError:
            skipped += 1
            continue

        # Slip imports are always dated on the 1st of the pay month.
        # If a salary already exists on this exact date → true duplicate slip, skip.
        exact_match = db.query(Income).filter(
            Income.user_id     == current_user.id,
            Income.source_type == IncomeSourceType.salary,
            Income.date        == pay_date,
        ).first()
        if exact_match:
            duplicate += 1
            continue

        # If a bank-statement salary exists for the same month (different date),
        # delete it — the slip record is richer (has deductions).
        bank_salary = db.query(Income).filter(
            Income.user_id     == current_user.id,
            Income.source_type == IncomeSourceType.salary,
            func.extract('month', Income.date) == pay_date.month,
            func.extract('year',  Income.date) == pay_date.year,
        ).first()
        if bank_salary:
            db.delete(bank_salary)
            db.flush()

        desc_parts = []
        if slip.employer:
            desc_parts.append(slip.employer)
        if slip.employee:
            desc_parts.append(f'({slip.employee})')
        if slip.description:
            desc_parts.append(slip.description)
        description = ' '.join(desc_parts) or 'Salary'

        from app.schemas.income import DeductionItem
        deduction_items = [DeductionItem(**d) for d in slip.deductions] if slip.deductions else []

        try:
            income_service.create_income(db, current_user.id, IncomeCreate(
                source_type=IncomeSourceType.salary,
                amount=slip.net_pay_paise,
                date=pay_date,
                description=description,
                is_recurring=True,
                recurring_interval='monthly',
                deductions=deduction_items,
                total_deductions_paise=slip.total_deductions_paise,
                gross_pay_paise=slip.gross_pay_paise,
            ))
            imported += 1
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning('Slip import skipped: %s', e)
            skipped += 1

    return {'imported': imported, 'skipped': skipped, 'duplicate': duplicate}


def _to_response(i) -> IncomeResponse:
    return IncomeResponse(
        id=i.id,
        account_id=i.account_id,
        source_type=i.source_type.value,
        amount=i.amount,
        date=i.date.isoformat(),
        description=i.description,
        is_recurring=i.is_recurring,
        deductions=i.deductions or [],
        total_deductions_paise=i.total_deductions_paise,
        gross_pay_paise=i.gross_pay_paise,
        created_at=i.created_at.isoformat(),
    )
