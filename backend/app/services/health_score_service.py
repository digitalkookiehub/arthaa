"""
Financial Health Score computation.

Pulls live data from all modules and returns a 0-100 score with 6 components.
Score is upserted once per day into financial_health_scores.
"""
import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.credit_card import CreditCard
from app.models.expense import Expense
from app.models.financial_health_score import FinancialHealthScore, HealthRating
from app.models.income import Income
from app.models.insurance import Insurance
from app.models.investment import Investment
from app.models.loan import Loan

logger = logging.getLogger(__name__)

# ── per-component max points (must sum to 100) ─────────────────────────────
_MAX = {
    'savings_ratio':      20,
    'debt_ratio':         20,
    'emergency_fund':     20,
    'investment_ratio':   20,
    'credit_utilization': 10,
    'insurance':          10,
}


def _months_ago(n: int) -> date:
    today = date.today()
    month = today.month - n
    year  = today.year + month // 12
    month = month % 12 or 12
    return date(year, month, 1)


def _avg_monthly(db: Session, user_id: int, model, amount_col, months: int = 3) -> int:
    """Average monthly total (in paise) over the last `months` months."""
    since = _months_ago(months)
    result = db.query(func.sum(amount_col)).filter(
        model.user_id == user_id,
        model.date >= since,
    ).scalar()
    return int((result or 0) / months)


# ── component scorers ──────────────────────────────────────────────────────

def _savings_score(monthly_income: int, monthly_expense: int) -> tuple[int, dict]:
    if monthly_income <= 0:
        return 0, {'rate_pct': 0, 'monthly_income': monthly_income, 'monthly_expense': monthly_expense}
    savings = monthly_income - monthly_expense
    rate = savings / monthly_income * 100
    if rate >= 30:   pts = 20
    elif rate >= 20: pts = 15
    elif rate >= 10: pts = 10
    elif rate >= 0:  pts = 5
    else:            pts = 0
    return pts, {'rate_pct': round(rate, 1), 'monthly_income': monthly_income, 'monthly_expense': monthly_expense}


def _debt_score(monthly_emi: int, monthly_income: int) -> tuple[int, dict]:
    if monthly_income <= 0:
        return 0, {'dti_pct': 0}
    dti = monthly_emi / monthly_income * 100
    if dti <= 10:    pts = 20
    elif dti <= 20:  pts = 17
    elif dti <= 30:  pts = 13
    elif dti <= 40:  pts = 8
    elif dti <= 50:  pts = 3
    else:            pts = 0
    return pts, {'dti_pct': round(dti, 1), 'monthly_emi': monthly_emi}


def _emergency_score(liquid_balance: int, monthly_expense: int) -> tuple[int, dict]:
    if monthly_expense <= 0:
        months_covered = 0.0
    else:
        months_covered = liquid_balance / monthly_expense
    if months_covered >= 6:   pts = 20
    elif months_covered >= 3: pts = 14
    elif months_covered >= 1: pts = 7
    else:                     pts = 0
    return pts, {'months_covered': round(months_covered, 1), 'liquid_balance': liquid_balance}


def _investment_score(monthly_income: int, total_investment_value: int) -> tuple[int, dict]:
    """
    Investment score based on investment-to-annual-income ratio.
    A good rule of thumb: investments should be >= 1× annual income.
    """
    annual_income = monthly_income * 12
    if annual_income <= 0:
        ratio = 0.0
    else:
        ratio = total_investment_value / annual_income * 100
    if ratio >= 100:  pts = 20
    elif ratio >= 50: pts = 16
    elif ratio >= 25: pts = 12
    elif ratio >= 10: pts = 7
    elif ratio > 0:   pts = 3
    else:             pts = 0
    return pts, {'ratio_pct': round(ratio, 1), 'total_investment_value': total_investment_value}


def _credit_score(cards: list) -> tuple[int, dict]:
    """Lower utilization = better score. No cards = full marks."""
    if not cards:
        return 10, {'avg_utilization_pct': 0, 'has_cards': False}
    total_limit = sum(c.credit_limit for c in cards)
    total_outstanding = sum(c.outstanding_balance for c in cards)
    if total_limit <= 0:
        return 10, {'avg_utilization_pct': 0}
    util_pct = total_outstanding / total_limit * 100
    if util_pct <= 10:   pts = 10
    elif util_pct <= 20: pts = 8
    elif util_pct <= 30: pts = 6
    elif util_pct <= 50: pts = 4
    elif util_pct <= 75: pts = 2
    else:                pts = 0
    return pts, {'avg_utilization_pct': round(util_pct, 1), 'total_outstanding': total_outstanding}


def _insurance_score(insurances: list) -> tuple[int, dict]:
    has_health = any(i.insurance_type.value == 'health' for i in insurances)
    has_life   = any(i.insurance_type.value == 'life'   for i in insurances)
    pts = (5 if has_health else 0) + (5 if has_life else 0)
    return pts, {'has_health': has_health, 'has_life': has_life, 'total_policies': len(insurances)}


def _rating(score: int) -> HealthRating:
    if score >= 80: return HealthRating.excellent
    if score >= 60: return HealthRating.good
    if score >= 40: return HealthRating.average
    return HealthRating.poor


# ── public API ─────────────────────────────────────────────────────────────

def compute_score(db: Session, user_id: int) -> dict:
    """
    Compute (and upsert today's) financial health score.
    Returns full score breakdown with actionable details.
    """
    today = date.today()

    # ── Gather raw data ──
    monthly_income  = _avg_monthly(db, user_id, Income,  Income.amount)
    monthly_expense = _avg_monthly(db, user_id, Expense, Expense.amount)

    # Liquid balance: all active bank/cash/wallet accounts
    liquid_balance = db.query(func.sum(Account.balance)).filter(
        Account.user_id == user_id,
        Account.is_active == True,
    ).scalar() or 0

    # Total monthly EMI from active loans
    monthly_emi = db.query(func.sum(Loan.emi_amount)).filter(
        Loan.user_id == user_id,
        Loan.outstanding_balance > 0,
    ).scalar() or 0

    # Total investment current value
    total_investment_value = db.query(func.sum(Investment.current_value)).filter(
        Investment.user_id == user_id,
    ).scalar() or 0

    # Credit cards
    cards = db.query(CreditCard).filter(
        CreditCard.user_id == user_id,
        CreditCard.is_active == True,
    ).all()

    # Insurance
    insurances = db.query(Insurance).filter(
        Insurance.user_id == user_id,
        Insurance.renewal_date >= today,
    ).all()

    # ── Score each component ──
    sav_pts,  sav_detail  = _savings_score(monthly_income, monthly_expense)
    debt_pts, debt_detail = _debt_score(monthly_emi, monthly_income)
    emg_pts,  emg_detail  = _emergency_score(liquid_balance, monthly_expense)
    inv_pts,  inv_detail  = _investment_score(monthly_income, total_investment_value)
    cc_pts,   cc_detail   = _credit_score(cards)
    ins_pts,  ins_detail  = _insurance_score(insurances)

    total = sav_pts + debt_pts + emg_pts + inv_pts + cc_pts + ins_pts
    rating = _rating(total)

    # ── Upsert today's record ──
    existing = db.query(FinancialHealthScore).filter(
        FinancialHealthScore.user_id == user_id,
        FinancialHealthScore.recorded_date == today,
    ).first()

    if existing:
        existing.score = total
        existing.savings_ratio_score      = sav_pts
        existing.debt_ratio_score         = debt_pts
        existing.emergency_fund_score     = emg_pts
        existing.investment_ratio_score   = inv_pts
        existing.credit_utilization_score = cc_pts
        existing.insurance_score          = ins_pts
        existing.rating                   = rating
    else:
        db.add(FinancialHealthScore(
            user_id=user_id, score=total, rating=rating,
            recorded_date=today,
            savings_ratio_score=sav_pts,
            debt_ratio_score=debt_pts,
            emergency_fund_score=emg_pts,
            investment_ratio_score=inv_pts,
            credit_utilization_score=cc_pts,
            insurance_score=ins_pts,
        ))
    db.commit()

    # ── Build recommendations ──
    recommendations = _recommendations(
        sav_pts, debt_pts, emg_pts, inv_pts, cc_pts, ins_pts,
        sav_detail, debt_detail, emg_detail, inv_detail, cc_detail, ins_detail,
    )

    # ── History (last 30 days) ──
    since = today - timedelta(days=30)
    history = db.query(FinancialHealthScore).filter(
        FinancialHealthScore.user_id == user_id,
        FinancialHealthScore.recorded_date >= since,
    ).order_by(FinancialHealthScore.recorded_date).all()

    logger.info('Health score user=%d score=%d rating=%s', user_id, total, rating.value)

    return {
        'score': total,
        'rating': rating.value,
        'recorded_date': today.isoformat(),
        'components': {
            'savings_ratio':      {'score': sav_pts,  'max': _MAX['savings_ratio'],      'detail': sav_detail},
            'debt_ratio':         {'score': debt_pts, 'max': _MAX['debt_ratio'],         'detail': debt_detail},
            'emergency_fund':     {'score': emg_pts,  'max': _MAX['emergency_fund'],     'detail': emg_detail},
            'investment_ratio':   {'score': inv_pts,  'max': _MAX['investment_ratio'],   'detail': inv_detail},
            'credit_utilization': {'score': cc_pts,   'max': _MAX['credit_utilization'], 'detail': cc_detail},
            'insurance':          {'score': ins_pts,  'max': _MAX['insurance'],          'detail': ins_detail},
        },
        'recommendations': recommendations,
        'history': [
            {'date': h.recorded_date.isoformat(), 'score': h.score, 'rating': h.rating.value}
            for h in history
        ],
    }


def _recommendations(sav, debt, emg, inv, cc, ins, sd, dd, ed, id_, cd, ind) -> list[dict]:
    recs = []

    if sav < 10:
        shortfall = max(0, sd.get('monthly_income', 0) - sd.get('monthly_expense', 0))
        recs.append({
            'priority': 'high',
            'title': 'Increase your savings rate',
            'body': (
                f"Your savings rate is {sd.get('rate_pct', 0)}% — target is 20%+. "
                "Review discretionary expenses (dining out, shopping) and automate a monthly SIP."
            ),
            'icon': '💰',
        })

    if debt > 0 and dd.get('dti_pct', 0) > 30:
        recs.append({
            'priority': 'high',
            'title': 'Reduce your EMI burden',
            'body': (
                f"Your EMI-to-income ratio is {dd.get('dti_pct', 0)}% — aim for under 30%. "
                "Consider a prepayment on your highest-interest loan to reduce principal."
            ),
            'icon': '🏦',
        })

    if emg < 14:
        months = ed.get('months_covered', 0)
        recs.append({
            'priority': 'high' if months < 1 else 'medium',
            'title': 'Build your emergency fund',
            'body': (
                f"You have {months:.1f} months of expenses covered — target is 6 months. "
                "Keep emergency funds in a liquid account like a savings account or liquid mutual fund."
            ),
            'icon': '🛡️',
        })

    if inv < 12:
        recs.append({
            'priority': 'medium',
            'title': 'Invest more for long-term wealth',
            'body': (
                f"Your investment corpus is {id_.get('ratio_pct', 0):.0f}% of your annual income. "
                "Start or increase a monthly SIP in index funds — even ₹5,000/month compounds significantly."
            ),
            'icon': '📈',
        })

    if cc < 6:
        recs.append({
            'priority': 'medium',
            'title': 'Reduce credit card utilization',
            'body': (
                f"Your credit card utilization is {cd.get('avg_utilization_pct', 0):.0f}% — keep it below 30%. "
                "Pay the full statement balance every month to avoid interest at 36-40% p.a."
            ),
            'icon': '💳',
        })

    if not ind.get('has_health'):
        recs.append({
            'priority': 'high',
            'title': 'Get health insurance',
            'body': (
                "You don't have health insurance tracked. Medical emergencies can wipe out savings. "
                "A family floater of ₹10L costs ~₹15,000-25,000/year."
            ),
            'icon': '🏥',
        })

    if not ind.get('has_life') and ind.get('has_health'):
        recs.append({
            'priority': 'medium',
            'title': 'Consider term life insurance',
            'body': (
                "A pure term plan of ₹1 Cr coverage costs ~₹8,000-15,000/year for a 30-year-old. "
                "Protect your family's financial future."
            ),
            'icon': '❤️',
        })

    if not recs:
        recs.append({
            'priority': 'low',
            'title': 'Great financial health!',
            'body': 'You\'re doing well across all categories. Keep maintaining your savings rate and review your investments quarterly.',
            'icon': '🎉',
        })

    return recs
