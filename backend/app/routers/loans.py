from datetime import date
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException, Body
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.loan import (
    LoanCreate, LoanUpdate, LoanResponse,
    RepaymentScheduleResponse, PrepaymentCreate,
    RateChangeCreate, PrepaymentSimulation, RateHistoryResponse,
    GoldInterestPaymentCreate, GoldInterestPaymentResponse,
)
from app.services import loan_service
from app.services.loan_calculator import simulate_prepayment
from app.services.schedule_parser import parse_schedule_file
from app.services.statement_parser import detect_rate_changes

router = APIRouter(prefix="/loans", tags=["loans"])


@router.get("", response_model=list[LoanResponse])
async def list_loans(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    loans = loan_service.get_loans(db, current_user.id)
    return [_to_response(l, db) for l in loans]


@router.post("", response_model=LoanResponse, status_code=201)
async def create_loan(
    data: LoanCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(loan_service.create_loan(db, current_user.id, data), db)


@router.get("/{loan_id}", response_model=LoanResponse)
async def get_loan(
    loan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(loan_service.get_loan(db, loan_id, current_user.id), db)


@router.put("/{loan_id}", response_model=LoanResponse)
async def update_loan(
    loan_id: int,
    data: LoanUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(loan, field, value)
    db.commit()
    db.refresh(loan)
    return _to_response(loan, db)


@router.get("/{loan_id}/schedule", response_model=list[RepaymentScheduleResponse])
async def get_schedule(
    loan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = loan_service.get_repayment_schedule(db, loan_id, current_user.id)
    return [
        RepaymentScheduleResponse(
            id=r.id, loan_id=r.loan_id, emi_number=r.emi_number,
            principal=r.principal, interest=r.interest,
            outstanding_balance=r.outstanding_balance,
            due_date=r.due_date.isoformat(), paid=r.paid,
            paid_date=r.paid_date.isoformat() if r.paid_date else None,
        )
        for r in rows
    ]


@router.patch("/{loan_id}/schedule/{row_id}/paid")
async def toggle_emi_paid(
    loan_id: int,
    row_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle paid/unpaid status for a single EMI row."""
    from datetime import date as _date
    from app.models.loan import RepaymentSchedule
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    row = db.query(RepaymentSchedule).filter(
        RepaymentSchedule.id == row_id,
        RepaymentSchedule.loan_id == loan.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule row not found")
    row.paid = not row.paid
    row.paid_date = _date.today() if row.paid else None
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "paid": row.paid,
        "paid_date": row.paid_date.isoformat() if row.paid_date else None,
    }


@router.post("/{loan_id}/prepayment", response_model=PrepaymentSimulation)
async def record_prepayment(
    loan_id: int,
    data: PrepaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = loan_service.record_prepayment(db, loan_id, current_user.id, data)
    return PrepaymentSimulation(prepayment_amount=data.amount, **result)


@router.post("/{loan_id}/simulate-prepayment", response_model=PrepaymentSimulation)
async def simulate_prepayment_endpoint(
    loan_id: int,
    data: PrepaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    result = simulate_prepayment(loan.outstanding_balance, loan.interest_rate, loan.remaining_tenure, data.amount)
    return PrepaymentSimulation(prepayment_amount=data.amount, **result)


@router.delete("/{loan_id}", status_code=204)
async def delete_loan(
    loan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    db.delete(loan)
    db.commit()


@router.post("/{loan_id}/upload-schedule")
async def upload_schedule(
    loan_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    import logging as _log
    _log.getLogger(__name__).warning(
        "upload-schedule: filename=%r size=%d first8=%r",
        file.filename, len(content), content[:8]
    )
    try:
        rows = parse_schedule_file(content, file.filename or "upload")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    count = loan_service.import_schedule_from_data(db, loan_id, current_user.id, rows)
    return {"imported_rows": count, "filename": file.filename}


@router.post("/{loan_id}/detect-rate-changes")
async def detect_rate_changes_from_statement(
    loan_id: int,
    file: UploadFile = File(...),
    password: str = Form(default=""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Scan a bank statement for 'RATE CHANGED FM X% TO Y%' entries.
    Returns detected changes, marks duplicates, and warns about missing FYs.
    """
    from datetime import date as _date
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    content = await file.read()
    try:
        result = detect_rate_changes(content, file.filename or "statement", password=password or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    changes = result['changes']
    period_start = result['period_start']
    period_end   = result['period_end']

    # Check which changes are already recorded (duplicate check)
    existing = loan_service.get_rate_history(db, loan_id, current_user.id)
    existing_keys = {
        (round(h.old_rate, 3), round(h.new_rate, 3), h.effective_date.isoformat())
        for h in existing
    }
    for c in changes:
        key = (round(c['old_rate'], 3), round(c['new_rate'], 3), c['effective_date'])
        c['already_recorded'] = key in existing_keys

    all_new = [c for c in changes if not c['already_recorded']]

    # Detect missing financial years between loan start and statement end
    missing_fy: list[str] = []
    if period_end:
        loan_start = loan.start_date
        stmt_start = _date.fromisoformat(period_start) if period_start else loan_start
        # FY runs Apr-Mar; build list of expected FYs
        fy_start_year = loan_start.year if loan_start.month >= 4 else loan_start.year - 1
        stmt_fy_end_year = (_date.fromisoformat(period_end).year
                            if period_end else fy_start_year)
        # If statement period starts after loan start + 1 FY, there's a gap
        expected_fy_start = _date(fy_start_year, 4, 1)
        if stmt_start > expected_fy_start:
            gap_fy_year = fy_start_year
            while _date(gap_fy_year + 1, 3, 31) < stmt_start:
                missing_fy.append(f"FY {gap_fy_year}-{str(gap_fy_year+1)[-2:]}")
                gap_fy_year += 1

    return {
        "detected": changes,
        "new_count": len(all_new),
        "total_count": len(changes),
        "period_start": period_start,
        "period_end": period_end,
        "missing_fy": missing_fy,
        "remaining_tenure": result.get('remaining_tenure'),
        "outstanding_balance_paise": result.get('outstanding_balance_paise'),
    }


@router.post("/{loan_id}/preview-schedule")
async def preview_schedule(
    loan_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns first 5 parsed rows without saving — useful to debug PDF/XLS parsing."""
    loan_service.get_loan(db, loan_id, current_user.id)  # ownership check
    content = await file.read()
    try:
        rows = parse_schedule_file(content, file.filename or "upload")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"total_rows": len(rows), "sample": rows[:5]}


@router.get("/{loan_id}/rate-history", response_model=list[RateHistoryResponse])
async def get_rate_history(
    loan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    history = loan_service.get_rate_history(db, loan_id, current_user.id)
    return [
        RateHistoryResponse(
            id=h.id,
            old_rate=h.old_rate,
            new_rate=h.new_rate,
            effective_date=h.effective_date.isoformat(),
            emi_impact=h.emi_impact,
            tenure_impact=h.tenure_impact,
            adjust_type=getattr(h, 'adjust_type', 'tenure'),
            note=getattr(h, 'note', None),
            created_at=h.created_at.isoformat(),
        )
        for h in history
    ]


@router.delete("/{loan_id}/rate-history", status_code=204)
async def clear_rate_history(
    loan_id: int,
    original_rate: float | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete all rate history and restore loan to its original interest rate.
    Pass ?original_rate=8.5 to explicitly set the starting rate.
    """
    from app.models.loan import InterestRateHistory
    from app.services.loan_calculator import calculate_emi
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    history = (
        db.query(InterestRateHistory)
        .filter(InterestRateHistory.loan_id == loan.id)
        .order_by(InterestRateHistory.effective_date.asc())
        .all()
    )
    reset_rate = original_rate or (history[0].old_rate if history else loan.interest_rate)
    loan.interest_rate = reset_rate
    loan.starting_interest_rate = reset_rate  # always save as authoritative starting rate
    loan.emi_amount = calculate_emi(loan.outstanding_balance, reset_rate, loan.remaining_tenure)
    for h in history:
        db.delete(h)
    db.commit()


@router.post("/{loan_id}/rate-change", response_model=LoanResponse)
async def change_rate(
    loan_id: int,
    data: RateChangeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(loan_service.record_rate_change(db, loan_id, current_user.id, data), db)


@router.get("/{loan_id}/gold-interest-payments", response_model=list[GoldInterestPaymentResponse])
async def list_gold_interest_payments(
    loan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.loan import GoldInterestPayment
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    payments = (
        db.query(GoldInterestPayment)
        .filter(GoldInterestPayment.loan_id == loan.id)
        .order_by(GoldInterestPayment.payment_date.desc())
        .all()
    )
    return [
        GoldInterestPaymentResponse(
            id=p.id,
            loan_id=p.loan_id,
            amount=p.amount,
            payment_date=p.payment_date.isoformat(),
            note=p.note,
            created_at=p.created_at.isoformat(),
        )
        for p in payments
    ]


@router.post("/{loan_id}/gold-interest-payments", response_model=GoldInterestPaymentResponse, status_code=201)
async def record_gold_interest_payment(
    loan_id: int,
    data: GoldInterestPaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.loan import GoldInterestPayment
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    if loan.repayment_type.value != 'bullet':
        raise HTTPException(status_code=400, detail="Interest payments only apply to bullet (gold) loans")
    payment = GoldInterestPayment(
        loan_id=loan.id,
        amount=data.amount,
        payment_date=data.payment_date,
        note=data.note,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return GoldInterestPaymentResponse(
        id=payment.id,
        loan_id=payment.loan_id,
        amount=payment.amount,
        payment_date=payment.payment_date.isoformat(),
        note=payment.note,
        created_at=payment.created_at.isoformat(),
    )


@router.post("/{loan_id}/gold-close", response_model=LoanResponse)
async def close_gold_loan(
    loan_id: int,
    close_date: date = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Close a gold (bullet) loan: calculate final accrued interest to close_date,
    record it as a payment, zero the outstanding balance, and stamp closure_date.
    """
    from app.models.loan import GoldInterestPayment
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    if not hasattr(loan, 'repayment_type') or loan.repayment_type.value != 'bullet':
        raise HTTPException(status_code=400, detail="Use /prepayment to close EMI loans")

    # Find last payment date to compute remaining accrued interest
    payments = (
        db.query(GoldInterestPayment)
        .filter(GoldInterestPayment.loan_id == loan.id)
        .order_by(GoldInterestPayment.payment_date.asc())
        .all()
    )
    from_date = payments[-1].payment_date if payments else loan.start_date
    days = (close_date - from_date).days
    accrued = int(loan.outstanding_balance * loan.interest_rate / 100 * max(days, 0) / 365)

    # Record the final interest as a payment entry
    if accrued > 0:
        db.add(GoldInterestPayment(
            loan_id=loan.id,
            amount=accrued,
            payment_date=close_date,
            note="Final closure — gold returned",
        ))

    loan.outstanding_balance = 0
    loan.closure_date = close_date
    db.commit()
    db.refresh(loan)
    return _to_response(loan, db)


@router.delete("/{loan_id}/gold-interest-payments/{payment_id}", status_code=204)
async def delete_gold_interest_payment(
    loan_id: int,
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.loan import GoldInterestPayment
    loan = loan_service.get_loan(db, loan_id, current_user.id)
    payment = db.query(GoldInterestPayment).filter(
        GoldInterestPayment.id == payment_id,
        GoldInterestPayment.loan_id == loan.id,
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    db.delete(payment)
    db.commit()


def _to_response(loan, db=None) -> LoanResponse:
    from datetime import date as _date
    from app.models.loan import GoldInterestPayment
    repayment_type = getattr(loan, 'repayment_type', 'emi')
    repayment_str = repayment_type.value if hasattr(repayment_type, 'value') else str(repayment_type)

    accrued_interest = 0
    total_interest_paid = 0
    last_payment_date = None

    if repayment_str == 'bullet' and db is not None:
        payments = (
            db.query(GoldInterestPayment)
            .filter(GoldInterestPayment.loan_id == loan.id)
            .order_by(GoldInterestPayment.payment_date.asc())
            .all()
        )
        total_interest_paid = sum(p.amount for p in payments)
        if payments:
            last_payment_date = payments[-1].payment_date
        # Accrue from last payment date (or loan start) to today
        from_date = last_payment_date if last_payment_date else loan.start_date
        days = (_date.today() - from_date).days
        accrued_interest = int(loan.outstanding_balance * loan.interest_rate / 100 * max(days, 0) / 365)
        total_interest = accrued_interest
    elif repayment_str == 'bullet':
        days = (_date.today() - loan.start_date).days
        accrued_interest = int(loan.outstanding_balance * loan.interest_rate / 100 * days / 365)
        total_interest = accrued_interest
    else:
        total_interest = max(0, loan.emi_amount * loan.remaining_tenure - loan.outstanding_balance)

    return LoanResponse(
        id=loan.id,
        loan_type=loan.loan_type.value,
        bank_name=loan.bank_name,
        loan_account_number=getattr(loan, 'loan_account_number', None),
        loan_amount=loan.loan_amount,
        outstanding_balance=loan.outstanding_balance,
        starting_interest_rate=getattr(loan, 'starting_interest_rate', None),
        interest_rate=loan.interest_rate,
        emi_amount=loan.emi_amount,
        start_date=loan.start_date.isoformat(),
        tenure_months=loan.tenure_months,
        remaining_tenure=loan.remaining_tenure,
        is_floating=loan.is_floating,
        repayment_type=repayment_str,
        total_interest_payable=total_interest,
        accrued_interest=accrued_interest,
        total_interest_paid=total_interest_paid,
        last_interest_payment_date=last_payment_date.isoformat() if last_payment_date else None,
        created_at=loan.created_at.isoformat(),
    )
