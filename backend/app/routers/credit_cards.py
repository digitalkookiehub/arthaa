from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.credit_card import (
    CreditCardCreate, CreditCardUpdate, CreditCardResponse,
    TransactionCreate, TransactionResponse,
)
from app.services import credit_card_service

router = APIRouter(prefix="/credit-cards", tags=["credit-cards"])


def _to_response(card) -> CreditCardResponse:
    return CreditCardResponse(
        id=card.id,
        card_name=card.card_name,
        bank_name=card.bank_name,
        last4_digits=card.last4_digits,
        credit_limit=card.credit_limit,
        outstanding_balance=card.outstanding_balance,
        due_date=card.due_date,
        minimum_due=card.minimum_due,
        interest_rate=card.interest_rate,
        rewards_points=card.rewards_points,
        is_active=card.is_active,
        utilization_pct=credit_card_service._utilization(card),
        days_until_due=credit_card_service._days_until_due(card.due_date),
        created_at=card.created_at.isoformat(),
    )


def _txn_response(txn) -> TransactionResponse:
    return TransactionResponse(
        id=txn.id,
        credit_card_id=txn.credit_card_id,
        amount=txn.amount,
        description=txn.description,
        date=txn.date.isoformat(),
        category_id=txn.category_id,
        is_payment=txn.is_payment,
        created_at=txn.created_at.isoformat(),
    )


# ── Cards ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[CreditCardResponse])
async def list_cards(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_to_response(c) for c in credit_card_service.get_cards(db, current_user.id)]


@router.post("", response_model=CreditCardResponse, status_code=201)
async def create_card(
    data: CreditCardCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(credit_card_service.create_card(db, current_user.id, data))


@router.get("/{card_id}", response_model=CreditCardResponse)
async def get_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(credit_card_service.get_card(db, card_id, current_user.id))


@router.put("/{card_id}", response_model=CreditCardResponse)
async def update_card(
    card_id: int,
    data: CreditCardUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(credit_card_service.update_card(db, card_id, current_user.id, data))


@router.delete("/{card_id}", status_code=204)
async def delete_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    credit_card_service.delete_card(db, card_id, current_user.id)


# ── Transactions ────────────────────────────────────────────────────────────

@router.get("/{card_id}/transactions", response_model=list[TransactionResponse])
async def list_transactions(
    card_id: int,
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txns = credit_card_service.get_transactions(db, card_id, current_user.id, month, year)
    return [_txn_response(t) for t in txns]


@router.post("/{card_id}/transactions", response_model=TransactionResponse, status_code=201)
async def add_transaction(
    card_id: int,
    data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _txn_response(credit_card_service.add_transaction(db, card_id, current_user.id, data))


@router.post("/parse-sms")
async def parse_sms(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Parse one or more bank SMS messages and return structured transaction data.
    Body: { sms_text: str }
    Returns: { results: [...], cards: [...] }  — cards list lets frontend auto-match by last4.
    """
    from app.services.sms_parser import parse_bulk_sms
    sms_text = (data.get('sms_text') or '').strip()
    if not sms_text:
        raise HTTPException(status_code=400, detail='sms_text is required')

    parsed = parse_bulk_sms(sms_text)
    if not parsed:
        raise HTTPException(status_code=422, detail='Could not extract any transactions. Make sure you paste bank SMS messages.')

    # Return user's cards so frontend can match by last4
    cards = credit_card_service.get_cards(db, current_user.id)
    cards_summary = [
        {'id': c.id, 'last4': c.last4_digits, 'bank_name': c.bank_name, 'card_name': c.card_name}
        for c in cards
    ]
    return {'results': parsed, 'cards': cards_summary}


@router.post("/parse-sms/apply")
async def apply_sms_transactions(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Bulk-apply confirmed SMS-parsed transactions.
    Body: { transactions: [{ card_id, amount_paise, merchant, date, is_payment }] }
    """
    from datetime import date as _date
    from app.models.credit_card import CreditCardTransaction

    txns = data.get('transactions', [])
    if not txns:
        raise HTTPException(status_code=400, detail='No transactions provided')

    added = 0
    for txn in txns:
        card_id = txn.get('card_id')
        if not card_id:
            continue
        # ownership check
        card = credit_card_service.get_card(db, card_id, current_user.id)
        amt = int(txn.get('amount_paise', 0))
        if amt <= 0:
            continue
        try:
            txn_date = _date.fromisoformat(txn['date'])
        except (KeyError, ValueError):
            txn_date = _date.today()

        is_pay = txn.get('is_payment', False)
        db.add(CreditCardTransaction(
            credit_card_id=card.id,
            amount=amt,
            description=txn.get('merchant'),
            date=txn_date,
            is_payment=is_pay,
        ))
        # update outstanding balance
        if is_pay:
            card.outstanding_balance = max(0, card.outstanding_balance - amt)
        else:
            card.outstanding_balance += amt
        added += 1

    db.commit()
    return {'added': added}


@router.post("/{card_id}/parse-statement")
async def parse_statement(
    card_id: int,
    file: UploadFile = File(...),
    password: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parse a CC statement PDF and return extracted fields + transactions for confirmation."""
    from app.services.cc_statement_parser import parse_cc_statement
    credit_card_service.get_card(db, card_id, current_user.id)   # ownership check
    content = await file.read()
    try:
        result = parse_cc_statement(content, file.filename or 'statement.pdf', password=password or None)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result


@router.post("/{card_id}/apply-statement", response_model=CreditCardResponse)
async def apply_statement(
    card_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply parsed statement data: update card fields and bulk-insert transactions."""
    from datetime import date as _date
    card = credit_card_service.get_card(db, card_id, current_user.id)
    from app.schemas.credit_card import CreditCardUpdate, TransactionCreate

    # Update card header fields
    update = {}
    if data.get('total_due_paise') is not None:
        update['outstanding_balance'] = data['total_due_paise']
    if data.get('min_due_paise') is not None:
        update['minimum_due'] = data['min_due_paise']
    if data.get('due_day') is not None:
        update['due_date'] = data['due_day']
    if data.get('credit_limit_paise') is not None:
        update['credit_limit'] = data['credit_limit_paise']
    if update:
        for k, v in update.items():
            setattr(card, k, v)
        db.commit()
        db.refresh(card)

    # Bulk-insert selected transactions
    txns_to_add = data.get('transactions', [])
    for txn in txns_to_add:
        try:
            txn_date = _date.fromisoformat(txn['date'])
        except (KeyError, ValueError):
            continue
        from app.models.credit_card import CreditCardTransaction
        db.add(CreditCardTransaction(
            credit_card_id=card.id,
            amount=int(txn['amount_paise']),
            description=txn.get('description'),
            date=txn_date,
            is_payment=txn.get('is_credit', False),
        ))
    if txns_to_add:
        db.commit()

    db.refresh(card)
    return _to_response(card)


@router.delete("/{card_id}/transactions/{txn_id}", status_code=204)
async def delete_transaction(
    card_id: int,
    txn_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    credit_card_service.delete_transaction(db, card_id, txn_id, current_user.id)
