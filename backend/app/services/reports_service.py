"""
Reports aggregation service.

Produces four report types:
  - cash_flow   : monthly income vs expense for a fiscal year
  - expense     : category/payment-method breakdown for a date range
  - net_worth   : historical snapshots
  - tax         : Indian IT-Act deductible investments + income summary
  - export_csv  : raw transaction export as CSV string
"""
import csv
import io
import logging
from datetime import date
from calendar import monthrange

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.models.expense import Expense, ExpenseCategory
from app.models.income import Income
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.net_worth_history import NetWorthHistory

logger = logging.getLogger(__name__)

# ── helpers ───────────────────────────────────────────────────────────────────

MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

# Indian fiscal year: April → March
def fiscal_year_range(fy: int) -> tuple[date, date]:
    """fy=2025 means Apr 2025 – Mar 2026."""
    return date(fy, 4, 1), date(fy + 1, 3, 31)


# ── cash flow report ──────────────────────────────────────────────────────────

def cash_flow_report(db: Session, user_id: int, year: int, fiscal: bool = True) -> dict:
    """
    Month-by-month income vs expense for a calendar or fiscal year.
    fiscal=True: April–March (Indian FY); fiscal=False: Jan–Dec.
    """
    if fiscal:
        start, end = fiscal_year_range(year)
        months_ordered = [(year, m) for m in range(4, 13)] + [(year + 1, m) for m in range(1, 4)]
    else:
        start, end = date(year, 1, 1), date(year, 12, 31)
        months_ordered = [(year, m) for m in range(1, 13)]

    # Income by month
    income_rows = (
        db.query(
            extract('year',  Income.date).label('yr'),
            extract('month', Income.date).label('mo'),
            func.sum(Income.amount).label('total'),
        )
        .filter(Income.user_id == user_id, Income.date >= start, Income.date <= end)
        .group_by('yr', 'mo')
        .all()
    )
    income_map = {(int(r.yr), int(r.mo)): int(r.total) for r in income_rows}

    # Expense by month
    expense_rows = (
        db.query(
            extract('year',  Expense.date).label('yr'),
            extract('month', Expense.date).label('mo'),
            func.sum(Expense.amount).label('total'),
        )
        .filter(Expense.user_id == user_id, Expense.date >= start, Expense.date <= end)
        .group_by('yr', 'mo')
        .all()
    )
    expense_map = {(int(r.yr), int(r.mo)): int(r.total) for r in expense_rows}

    rows = []
    total_income  = 0
    total_expense = 0
    for yr, mo in months_ordered:
        inc = income_map.get((yr, mo), 0)
        exp = expense_map.get((yr, mo), 0)
        savings = inc - exp
        total_income  += inc
        total_expense += exp
        rows.append({
            'month':    f'{MONTH_NAMES[mo - 1]} {yr}',
            'income':   inc,
            'expense':  exp,
            'savings':  savings,
            'savings_rate': round(savings / inc * 100, 1) if inc else 0,
        })

    total_savings = total_income - total_expense
    return {
        'type':          'cash_flow',
        'year':          year,
        'fiscal':        fiscal,
        'period_label':  f'FY {year}-{str(year + 1)[2:]}' if fiscal else str(year),
        'rows':          rows,
        'total_income':  total_income,
        'total_expense': total_expense,
        'total_savings': total_savings,
        'savings_rate':  round(total_savings / total_income * 100, 1) if total_income else 0,
    }


# ── expense breakdown report ──────────────────────────────────────────────────

def expense_report(db: Session, user_id: int, from_date: date, to_date: date) -> dict:
    """Category-wise and payment-method-wise expense breakdown."""

    # By category
    cat_rows = (
        db.query(
            ExpenseCategory.name.label('category'),
            ExpenseCategory.icon.label('icon'),
            ExpenseCategory.color.label('color'),
            func.sum(Expense.amount).label('total'),
            func.count(Expense.id).label('count'),
        )
        .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
        .filter(Expense.user_id == user_id, Expense.date >= from_date, Expense.date <= to_date)
        .group_by(ExpenseCategory.id)
        .order_by(func.sum(Expense.amount).desc())
        .all()
    )

    total = sum(int(r.total) for r in cat_rows)
    by_category = [
        {
            'category': r.category,
            'icon':     r.icon or '•',
            'color':    r.color or '#718096',
            'amount':   int(r.total),
            'count':    int(r.count),
            'pct':      round(int(r.total) / total * 100, 1) if total else 0,
        }
        for r in cat_rows
    ]

    # By payment method
    pm_rows = (
        db.query(
            Expense.payment_method,
            func.sum(Expense.amount).label('total'),
        )
        .filter(Expense.user_id == user_id, Expense.date >= from_date, Expense.date <= to_date,
                Expense.payment_method.isnot(None))
        .group_by(Expense.payment_method)
        .order_by(func.sum(Expense.amount).desc())
        .all()
    )
    by_payment = [
        {
            'method': (r.payment_method.value if hasattr(r.payment_method, 'value') else r.payment_method) or 'other',
            'amount': int(r.total),
            'pct':    round(int(r.total) / total * 100, 1) if total else 0,
        }
        for r in pm_rows
    ]

    # Day-wise trend (for the range)
    day_rows = (
        db.query(Expense.date, func.sum(Expense.amount).label('total'))
        .filter(Expense.user_id == user_id, Expense.date >= from_date, Expense.date <= to_date)
        .group_by(Expense.date)
        .order_by(Expense.date)
        .all()
    )
    daily_trend = [{'date': str(r.date), 'amount': int(r.total)} for r in day_rows]

    # Top 5 individual expenses
    top_expenses = (
        db.query(Expense, ExpenseCategory)
        .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
        .filter(Expense.user_id == user_id, Expense.date >= from_date, Expense.date <= to_date)
        .order_by(Expense.amount.desc())
        .limit(5)
        .all()
    )
    top5 = [
        {
            'date':        str(e.date),
            'description': e.description or '',
            'category':    c.name,
            'icon':        c.icon or '•',
            'amount':      e.amount,
        }
        for e, c in top_expenses
    ]

    return {
        'type':         'expense',
        'from_date':    str(from_date),
        'to_date':      str(to_date),
        'total':        total,
        'by_category':  by_category,
        'by_payment':   by_payment,
        'daily_trend':  daily_trend,
        'top5':         top5,
    }


# ── net worth trend report ────────────────────────────────────────────────────

def net_worth_report(db: Session, user_id: int, months: int = 12) -> dict:
    """Last N months of net worth snapshots."""
    rows = (
        db.query(NetWorthHistory)
        .filter(NetWorthHistory.user_id == user_id)
        .order_by(NetWorthHistory.recorded_date.desc())
        .limit(months)
        .all()
    )
    rows = list(reversed(rows))

    snapshots = [
        {
            'date':              str(r.recorded_date),
            'total_assets':      r.total_assets,
            'total_liabilities': r.total_liabilities,
            'net_worth':         r.net_worth,
        }
        for r in rows
    ]

    change = 0
    change_pct = 0.0
    if len(snapshots) >= 2:
        first = snapshots[0]['net_worth']
        last  = snapshots[-1]['net_worth']
        change     = last - first
        change_pct = round(change / abs(first) * 100, 1) if first else 0.0

    return {
        'type':        'net_worth',
        'snapshots':   snapshots,
        'change':      change,
        'change_pct':  change_pct,
        'latest':      snapshots[-1] if snapshots else None,
    }


# ── tax summary report (Indian IT Act) ───────────────────────────────────────

# 80C qualifying investment types
_80C_TYPES = {'PPF', 'EPF', 'NPS', 'FD', 'PostOffice', 'MutualFund', 'SIP'}
_80C_LIMIT  = 150_000 * 100   # ₹1.5L in paise

def tax_report(db: Session, user_id: int, fy: int) -> dict:
    """
    Indian income tax summary for a fiscal year (Apr–Mar).
    fy=2025 means FY 2025-26.
    """
    start, end = fiscal_year_range(fy)

    # Total income by source
    inc_rows = (
        db.query(Income.source_type, func.sum(Income.amount).label('total'))
        .filter(Income.user_id == user_id, Income.date >= start, Income.date <= end)
        .group_by(Income.source_type)
        .all()
    )
    income_by_source = {
        (r.source_type.value if hasattr(r.source_type, 'value') else r.source_type): int(r.total)
        for r in inc_rows
    }
    gross_income = sum(income_by_source.values())

    # 80C investments
    investments_80c = (
        db.query(Investment)
        .filter(
            Investment.user_id == user_id,
            Investment.investment_type.in_(_80C_TYPES),
        )
        .all()
    )
    deduction_80c_raw = sum(i.invested_amount for i in investments_80c)
    deduction_80c     = min(deduction_80c_raw, _80C_LIMIT)

    inv_by_type = {}
    for i in investments_80c:
        t = i.investment_type.value if hasattr(i.investment_type, 'value') else i.investment_type
        inv_by_type[t] = inv_by_type.get(t, 0) + i.invested_amount

    # Standard deduction (₹75,000 for FY 2024-25 onwards)
    std_deduction = 75_000 * 100

    # NPS additional deduction 80CCD(1B) — ₹50,000 extra
    nps_investments  = [i for i in investments_80c if (i.investment_type.value if hasattr(i.investment_type, 'value') else i.investment_type) == 'NPS']
    deduction_80ccd  = min(sum(i.invested_amount for i in nps_investments), 50_000 * 100)

    # Housing loan interest (not in current model — show placeholder)
    housing_loan_interest = (
        db.query(func.sum(Loan.loan_amount - Loan.outstanding_balance))
        .filter(
            Loan.user_id == user_id,
            Loan.loan_type == 'home',
            Loan.outstanding_balance > 0,
        )
        .scalar() or 0
    )

    total_deductions  = std_deduction + deduction_80c + deduction_80ccd
    taxable_income    = max(gross_income - total_deductions, 0)

    # Estimated tax (new regime FY 2025-26 slabs, in paise)
    estimated_tax = _new_regime_tax(taxable_income)

    return {
        'type':              'tax',
        'fy':                fy,
        'period_label':      f'FY {fy}-{str(fy + 1)[2:]}',
        'gross_income':      gross_income,
        'income_by_source':  income_by_source,
        'deductions': {
            'standard':      std_deduction,
            '80C':           deduction_80c,
            '80C_raw':       deduction_80c_raw,
            '80C_limit':     _80C_LIMIT,
            '80CCD_1B':      deduction_80ccd,
            'total':         total_deductions,
        },
        'investments_80c':   inv_by_type,
        'taxable_income':    taxable_income,
        'estimated_tax':     estimated_tax,
        'effective_rate':    round(estimated_tax / gross_income * 100, 1) if gross_income else 0,
    }


def _new_regime_tax(taxable_income_paise: int) -> int:
    """New tax regime slabs (FY 2025-26) — returns tax in paise."""
    ti = taxable_income_paise / 100  # convert to rupees
    # Rebate u/s 87A: no tax if income <= ₹12,00,000
    if ti <= 1_200_000:
        return 0
    # Slabs
    slabs = [
        (400_000,  0.00),
        (400_000,  0.05),
        (400_000,  0.10),
        (400_000,  0.15),
        (400_000,  0.20),
        (float('inf'), 0.30),
    ]
    tax   = 0.0
    remaining = ti
    for slab_size, rate in slabs:
        taxable = min(remaining, slab_size)
        tax     += taxable * rate
        remaining -= taxable
        if remaining <= 0:
            break
    # 4% cess
    tax *= 1.04
    return int(round(tax * 100))  # back to paise


# ── CSV export ────────────────────────────────────────────────────────────────

def export_csv(
    db: Session,
    user_id: int,
    from_date: date,
    to_date: date,
    data_type: str = "all",
) -> str:
    """
    Export transactions as a CSV string.
    data_type: 'expenses' | 'income' | 'all'
    Amounts returned in ₹ (rupees) with 2 decimal places.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)

    if data_type in ("expenses", "all"):
        writer.writerow(["Date", "Type", "Description", "Category", "Amount (₹)", "Payment Method", "Tags"])
        rows = (
            db.query(Expense, ExpenseCategory)
            .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
            .filter(Expense.user_id == user_id, Expense.date >= from_date, Expense.date <= to_date)
            .order_by(Expense.date.asc())
            .all()
        )
        for exp, cat in rows:
            pm = (exp.payment_method.value if hasattr(exp.payment_method, 'value') else exp.payment_method) or ''
            tags = ','.join(exp.tags or [])
            writer.writerow([
                str(exp.date),
                'Expense',
                exp.description or '',
                cat.name,
                f'{exp.amount / 100:.2f}',
                pm,
                tags,
            ])

    if data_type in ("income", "all"):
        if data_type == "all":
            writer.writerow([])  # blank separator
        writer.writerow(["Date", "Type", "Description", "Source", "Net Pay (₹)", "Gross Pay (₹)", "Total Deductions (₹)"])
        inc_rows = (
            db.query(Income)
            .filter(Income.user_id == user_id, Income.date >= from_date, Income.date <= to_date)
            .order_by(Income.date.asc())
            .all()
        )
        for inc in inc_rows:
            src = (inc.source_type.value if hasattr(inc.source_type, 'value') else inc.source_type) or ''
            gross = f'{inc.gross_pay_paise / 100:.2f}' if inc.gross_pay_paise else ''
            ded   = f'{inc.total_deductions_paise / 100:.2f}' if inc.total_deductions_paise else ''
            writer.writerow([
                str(inc.date),
                'Income',
                inc.description or '',
                src,
                f'{inc.amount / 100:.2f}',
                gross,
                ded,
            ])

    return buf.getvalue()
