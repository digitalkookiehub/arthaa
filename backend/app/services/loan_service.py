import logging
import math
from datetime import date

from sqlalchemy.orm import Session

from app.exceptions import NotFoundError, ForbiddenError
from app.models.loan import Loan, RepaymentSchedule, InterestRateHistory, LoanPrepayment
from app.schemas.loan import LoanCreate, LoanUpdate, PrepaymentCreate, RateChangeCreate
from app.services.loan_calculator import calculate_emi, generate_schedule, simulate_prepayment

logger = logging.getLogger(__name__)


def get_loans(db: Session, user_id: int) -> list[Loan]:
    return db.query(Loan).filter(Loan.user_id == user_id).all()


def get_loan(db: Session, loan_id: int, user_id: int) -> Loan:
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise NotFoundError("Loan")
    if loan.user_id != user_id:
        raise ForbiddenError()
    return loan


def create_loan(db: Session, user_id: int, data: LoanCreate) -> Loan:
    from app.models.loan import RepaymentType
    is_bullet = data.repayment_type == RepaymentType.bullet
    tenure = data.tenure_months if data.tenure_months else (12 if is_bullet else 1)
    emi = 0 if is_bullet else (data.emi_amount or calculate_emi(data.loan_amount, data.interest_rate, tenure))
    loan = Loan(
        user_id=user_id,
        loan_type=data.loan_type,
        bank_name=data.bank_name,
        loan_account_number=data.loan_account_number,
        loan_amount=data.loan_amount,
        outstanding_balance=data.outstanding_balance,
        starting_interest_rate=data.starting_interest_rate,
        interest_rate=data.interest_rate,
        emi_amount=emi,
        start_date=data.start_date,
        tenure_months=tenure,
        remaining_tenure=data.remaining_tenure if data.remaining_tenure is not None else tenure,
        is_floating=data.is_floating,
        repayment_type=data.repayment_type,
        account_id=data.account_id,
    )
    db.add(loan)
    db.flush()

    if not is_bullet:
        schedule = generate_schedule(data.loan_amount, data.interest_rate, tenure, data.start_date)
        for row in schedule:
            db.add(RepaymentSchedule(
                loan_id=loan.id,
                emi_number=row.emi_number,
                principal=row.principal,
                interest=row.interest,
                outstanding_balance=row.outstanding_balance,
                due_date=row.due_date,
            ))

    db.commit()
    db.refresh(loan)
    logger.info("Loan created: %s for user %s, EMI: %s paise, floating: %s", loan.id, user_id, emi, data.is_floating)
    return loan


def get_repayment_schedule(db: Session, loan_id: int, user_id: int) -> list[RepaymentSchedule]:
    loan = get_loan(db, loan_id, user_id)
    return (
        db.query(RepaymentSchedule)
        .filter(RepaymentSchedule.loan_id == loan.id)
        .order_by(RepaymentSchedule.emi_number)
        .all()
    )


def record_prepayment(db: Session, loan_id: int, user_id: int, data: PrepaymentCreate) -> dict:
    loan = get_loan(db, loan_id, user_id)
    new_outstanding = max(0, loan.outstanding_balance - data.amount)
    simulation = simulate_prepayment(
        loan.outstanding_balance, loan.interest_rate, loan.remaining_tenure, data.amount
    )

    if data.prepayment_type.value == 'emi_increase':
        # Keep tenure, reduce EMI
        from app.services.loan_calculator import calculate_emi
        new_emi = calculate_emi(new_outstanding, loan.interest_rate, loan.remaining_tenure) if new_outstanding > 0 else 0
        emi_reduced = loan.emi_amount - new_emi
        orig_total = loan.emi_amount * loan.remaining_tenure
        new_total = new_emi * loan.remaining_tenure
        simulation = {
            "interest_saved": max(0, orig_total - new_total - data.amount),
            "tenure_reduced": 0,
            "new_emi": new_emi,
            "new_tenure": loan.remaining_tenure,
        }
        loan.emi_amount = new_emi
        loan.remaining_tenure = loan.remaining_tenure
    else:
        # Default: keep EMI, reduce tenure
        loan.remaining_tenure = simulation["new_tenure"]

    db.add(LoanPrepayment(
        loan_id=loan.id,
        amount=data.amount,
        date=data.date,
        prepayment_type=data.prepayment_type,
        interest_saved=simulation["interest_saved"],
        tenure_reduced=simulation["tenure_reduced"],
    ))
    loan.outstanding_balance = new_outstanding
    db.commit()
    logger.info("Prepayment recorded for loan %s: %s paise, type: %s", loan_id, data.amount, data.prepayment_type)
    return simulation


def record_rate_change(db: Session, loan_id: int, user_id: int, data: RateChangeCreate) -> Loan:
    loan = get_loan(db, loan_id, user_id)
    # Use explicit old_rate when provided (auto-detect flow), otherwise use current loan rate
    effective_old_rate = data.old_rate if data.old_rate is not None else loan.interest_rate
    if effective_old_rate != loan.interest_rate:
        loan.interest_rate = effective_old_rate  # correct the loan rate before recalculating

    r = data.new_rate / 12 / 100

    if data.skip_tenure_update:
        # Statement import: just record the history, don't touch remaining_tenure.
        # The caller will set remaining_tenure from the statement's authoritative value.
        emi_impact = 0
        tenure_impact = 0
        new_emi = loan.emi_amount
        new_tenure = loan.remaining_tenure
    elif data.adjust_type == 'tenure':
        # Indian default: keep EMI constant, recalculate remaining tenure
        emi = loan.emi_amount
        if r > 0 and emi > loan.outstanding_balance * r:
            new_tenure = math.ceil(
                math.log(emi / (emi - loan.outstanding_balance * r)) / math.log(1 + r)
            )
        else:
            new_tenure = loan.remaining_tenure
        tenure_impact = new_tenure - loan.remaining_tenure
        emi_impact = 0
        new_emi = emi
    else:
        # Keep tenure, recalculate EMI
        new_emi = calculate_emi(loan.outstanding_balance, data.new_rate, loan.remaining_tenure)
        emi_impact = new_emi - loan.emi_amount
        tenure_impact = 0
        new_tenure = loan.remaining_tenure

    db.add(InterestRateHistory(
        loan_id=loan.id,
        old_rate=effective_old_rate,
        new_rate=data.new_rate,
        effective_date=data.effective_date,
        emi_impact=emi_impact,
        tenure_impact=tenure_impact,
        adjust_type=data.adjust_type,
        note=data.note,
    ))
    loan.interest_rate = data.new_rate
    loan.emi_amount = new_emi
    loan.remaining_tenure = new_tenure
    db.commit()
    db.refresh(loan)
    logger.info("Rate changed for loan %s: %.2f%% → %.2f%% (%s)", loan_id, loan.interest_rate, data.new_rate, data.adjust_type)
    return loan


def get_rate_history(db: Session, loan_id: int, user_id: int) -> list[InterestRateHistory]:
    loan = get_loan(db, loan_id, user_id)
    return (
        db.query(InterestRateHistory)
        .filter(InterestRateHistory.loan_id == loan.id)
        .order_by(InterestRateHistory.effective_date.asc())
        .all()
    )


def import_schedule_from_data(db: Session, loan_id: int, user_id: int, rows: list[dict]) -> int:
    loan = get_loan(db, loan_id, user_id)
    db.query(RepaymentSchedule).filter(RepaymentSchedule.loan_id == loan.id).delete()
    count = 0
    for row in rows:
        db.add(RepaymentSchedule(
            loan_id=loan.id,
            emi_number=row["emi_number"],
            principal=row["principal"],
            interest=row["interest"],
            outstanding_balance=row["outstanding_balance"],
            due_date=row["due_date"],
            paid=row.get("paid", False),
        ))
        count += 1
    db.commit()
    logger.info("Imported %s schedule rows for loan %s", count, loan_id)
    return count
