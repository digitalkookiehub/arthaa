"""
Import ICICI personal loan repayment schedules from XLS files.

Usage:
    cd backend
    python scripts/import_icici_loans.py --user-id 1

The --user-id must be the ID of an already-registered user.
Run 'python scripts/import_icici_loans.py --list-users' to see existing users.
"""
import argparse
import logging
import sys
from datetime import date, datetime
from pathlib import Path

# Make sure app package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import xlrd
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.loan import Loan, LoanType, RepaymentSchedule
from app.models.user import User

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

LOAN_FILES = [
    {
        "path": Path(__file__).resolve().parent.parent.parent
        / "Loan_Schedules"
        / "icici Loan1.xls",
        "account_number": "LPCHE00051576941",
        "loan_amount_inr": 2450000,
        "emi_inr": 52276,
        "tenure_months": 60,
        "interest_rate": 10.30,
        "start_date": date(2025, 10, 5),
        "paid_through_emi": 8,  # EMIs 1-8 paid as of June 22, 2026
    },
    {
        "path": Path(__file__).resolve().parent.parent.parent
        / "Loan_Schedules"
        / "icici Loan2.xls",
        "account_number": "LPCHE00052212128",
        "loan_amount_inr": 100000,
        "emi_inr": 1892,
        "tenure_months": 72,
        "interest_rate": 10.75,
        "start_date": date(2026, 4, 5),
        "paid_through_emi": 2,  # EMIs 1-2 paid as of June 22, 2026
    },
]


def _parse_inr(value: str) -> int:
    """Parse Indian number format like '24,50,000.00' → paise integer."""
    return round(float(str(value).replace(",", "")) * 100)


def _parse_date(value: str) -> date:
    """Parse DD/MM/YYYY → date."""
    return datetime.strptime(str(value).strip(), "%d/%m/%Y").date()


def read_schedule(xls_path: Path) -> list[dict]:
    """Read amortization schedule rows from XLS file."""
    wb = xlrd.open_workbook(str(xls_path))
    sh = wb.sheets()[0]
    rows = []
    for r in range(4, sh.nrows):  # data starts at row index 4
        row = [sh.cell_value(r, c) for c in range(sh.ncols)]
        emi_num = row[1]
        if not emi_num:
            continue
        rows.append(
            {
                "emi_number": int(float(str(emi_num))),
                "due_date": _parse_date(row[2]),
                "opening_balance_paise": _parse_inr(row[4]),
                "principal_paise": _parse_inr(row[5]),
                "emi_paise": _parse_inr(row[6]),
                "interest_paise": _parse_inr(row[8]),
                "closing_balance_paise": _parse_inr(row[10]),
            }
        )
    return rows


def import_loan(db: Session, user_id: int, meta: dict) -> None:
    """Create a Loan + RepaymentSchedule entries from XLS file."""
    logger.info("Importing loan %s ...", meta["account_number"])

    schedule = read_schedule(meta["path"])
    if not schedule:
        logger.error("No schedule rows found in %s", meta["path"])
        return

    paid_through = meta["paid_through_emi"]
    # Outstanding balance = closing balance of last paid EMI
    outstanding_paise = schedule[paid_through - 1]["closing_balance_paise"]
    remaining_tenure = meta["tenure_months"] - paid_through

    # Check for duplicate
    existing = (
        db.query(Loan)
        .filter(Loan.user_id == user_id, Loan.bank_name == f"ICICI Bank – {meta['account_number']}")
        .first()
    )
    if existing:
        logger.warning("Loan %s already exists (id=%s), skipping.", meta["account_number"], existing.id)
        return

    loan = Loan(
        user_id=user_id,
        loan_type=LoanType.personal,
        bank_name=f"ICICI Bank – {meta['account_number']}",
        loan_amount=meta["loan_amount_inr"] * 100,  # paise
        outstanding_balance=outstanding_paise,
        interest_rate=meta["interest_rate"],
        emi_amount=meta["emi_inr"] * 100,  # paise
        tenure_months=meta["tenure_months"],
        remaining_tenure=remaining_tenure,
        start_date=meta["start_date"],
    )
    db.add(loan)
    db.flush()  # get loan.id

    for row in schedule:
        paid = row["emi_number"] <= paid_through
        entry = RepaymentSchedule(
            loan_id=loan.id,
            emi_number=row["emi_number"],
            principal=row["principal_paise"],
            interest=row["interest_paise"],
            outstanding_balance=row["closing_balance_paise"],
            due_date=row["due_date"],
            paid=paid,
            paid_date=row["due_date"] if paid else None,
        )
        db.add(entry)

    db.commit()
    logger.info(
        "Imported loan id=%s (%s): %d EMIs total, %d paid, outstanding ₹%.0f",
        loan.id,
        meta["account_number"],
        len(schedule),
        paid_through,
        outstanding_paise / 100,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Import ICICI loan schedules into ArthaA")
    parser.add_argument("--user-id", type=int, help="User ID to assign loans to")
    parser.add_argument("--list-users", action="store_true", help="List registered users")
    args = parser.parse_args()

    db: Session = SessionLocal()
    try:
        if args.list_users:
            users = db.query(User).all()
            if not users:
                print("No users registered yet. Register via the app first.")
            else:
                print("Registered users:")
                for u in users:
                    print(f"  id={u.id}  email={u.email}  name={u.full_name}")
            return

        if not args.user_id:
            parser.error("--user-id is required. Use --list-users to see available users.")

        user = db.query(User).filter(User.id == args.user_id).first()
        if not user:
            logger.error("User id=%d not found.", args.user_id)
            sys.exit(1)

        logger.info("Importing loans for user: %s (%s)", user.full_name, user.email)
        for meta in LOAN_FILES:
            if not meta["path"].exists():
                logger.error("File not found: %s", meta["path"])
                continue
            import_loan(db, args.user_id, meta)

        logger.info("Done. View loans at /api/v1/loans in the app.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
