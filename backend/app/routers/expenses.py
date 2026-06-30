import logging
from typing import Any

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.expense import ExpenseCategory
from app.models.user import User
from app.schemas.expense import (
    ExpenseCreate, ExpenseUpdate, ExpenseResponse,
    ExpenseCategoryResponse, ExpenseFilters,
)
from app.services import expense_service
from app.services.bank_statement_parser import parse_bank_statement

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("/categories", response_model=list[ExpenseCategoryResponse])
async def list_categories(db: Session = Depends(get_db)):
    return expense_service.get_categories(db)


@router.get("", response_model=dict)
async def list_expenses(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=1000),
    from_date: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    to_date: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000),
    category_id: int | None = None,
    account_id: int | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    parsed_from = date_type.fromisoformat(from_date) if from_date else None
    parsed_to   = date_type.fromisoformat(to_date)   if to_date   else None
    filters = ExpenseFilters(
        page=page, limit=limit,
        from_date=parsed_from, to_date=parsed_to,
        month=month, year=year,
        category_id=category_id, account_id=account_id, search=search,
    )
    items, total = expense_service.get_expenses(db, current_user.id, filters)
    return {
        "data": [_to_response(e) for e in items],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    data: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(expense_service.create_expense(db, current_user.id, data))


@router.get("/monthly-total")
async def monthly_total(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total = expense_service.get_monthly_total(db, current_user.id, month, year)
    return {"month": month, "year": year, "total": total}


@router.get("/category-totals")
async def category_totals(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return expense_service.get_category_totals(db, current_user.id, month, year)


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(expense_service.get_expense(db, expense_id, current_user.id))


@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: int,
    data: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(expense_service.update_expense(db, expense_id, current_user.id, data))


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense_service.delete_expense(db, expense_id, current_user.id)


class ImportRow(BaseModel):
    date: str
    description: str
    amount_paise: int
    type: str              # expense | atm | transfer_out | transfer_in | income
    category_name: str | None = None
    account_id: int | None = None


class ImportRequest(BaseModel):
    rows: list[ImportRow]


@router.post("/parse-statement")
async def parse_statement(
    file: UploadFile = File(...),
    password: str    = Form(default=''),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a bank account PDF statement → returns classified transactions for preview."""
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, 'File too large (max 20 MB)')
    try:
        result = parse_bank_statement(content, file.filename or 'statement.pdf', password or None)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error('Bank statement parse error: %s', e)
        raise HTTPException(500, 'Could not parse statement. Ensure it is a valid bank PDF.')
    return result


@router.post("/import-statement", status_code=201)
async def import_statement(
    body: ImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bulk-import selected rows into the expenses table. Income rows are skipped — use salary slip upload instead."""
    from datetime import date as date_type

    # Pre-load categories for name→id mapping
    cats = db.query(ExpenseCategory).all()
    cat_map: dict[str, int] = {c.name.lower(): c.id for c in cats}

    other_id = (
        cat_map.get('miscellaneous')
        or cat_map.get('other')
        or (cats[0].id if cats else None)
    )
    if other_id is None:
        raise HTTPException(400, 'No expense categories found. Run database seed first.')

    _TYPE_CAT: dict[str, str] = {
        'atm':          'ATM Cash',
        'loan_emi':     'EMIs',
        'cc_payment':   'Transfer',
        'transfer_out': 'Transfer',
        'transfer_in':  'Transfer',
    }

    expenses_imported = 0
    skipped           = 0

    for row in body.rows:
        try:
            txn_date = date_type.fromisoformat(row.date)
        except ValueError:
            skipped += 1
            continue

        # ── Income / credit rows are skipped — income comes from salary slips only ──
        if row.type in ('income', 'transfer_in'):
            skipped += 1
            continue

        # ── Debit rows → expenses table ───────────────────────────────────────
        if row.type == 'expense' and row.category_name:
            cat_id = cat_map.get(row.category_name.lower(), other_id)
        elif row.type == 'loan_emi':
            cat_id = cat_map.get('emis', other_id)
        elif row.type in _TYPE_CAT:
            cat_id = cat_map.get(_TYPE_CAT[row.type].lower(), other_id)
        else:
            cat_id = other_id

        tags: list[str] = []
        if row.type == 'atm':            tags = ['atm', 'cash']
        elif row.type == 'loan_emi':     tags = ['loan', 'emi']
        elif row.type == 'cc_payment':   tags = ['credit-card', 'bill']
        elif row.type == 'transfer_out': tags = ['transfer']

        try:
            expense_service.create_expense(db, current_user.id, ExpenseCreate(
                account_id=row.account_id,
                category_id=cat_id,
                date=txn_date,
                amount=row.amount_paise,
                description=row.description,
                payment_method=None,
                tags=tags,
            ))
            expenses_imported += 1
        except Exception as e:
            logger.warning('Expense row skipped: %s — %s', row.description, e)
            skipped += 1

    return {
        'imported':          expenses_imported,
        'expenses_imported': expenses_imported,
        'income_imported':   0,
        'skipped':           skipped,
    }


def _to_response(e) -> ExpenseResponse:
    return ExpenseResponse(
        id=e.id,
        account_id=e.account_id,
        category_id=e.category_id,
        category=ExpenseCategoryResponse(
            id=e.category.id,
            name=e.category.name,
            icon=e.category.icon,
            color=e.category.color,
            is_system=e.category.is_system,
        ) if e.category else None,
        date=e.date.isoformat(),
        amount=e.amount,
        description=e.description,
        subcategory=e.subcategory,
        payment_method=e.payment_method.value if e.payment_method else None,
        location=e.location,
        tags=e.tags or [],
        is_recurring=e.is_recurring,
        bill_attachment_url=e.bill_attachment_url,
        created_at=e.created_at.isoformat(),
    )
