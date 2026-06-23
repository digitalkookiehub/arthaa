"""
AI Advisor service.

Builds a structured financial context from all user data, generates:
- Streaming chat responses (Ollama /api/chat with SSE)
- Auto-insights (rule-based + Ollama narrative)
- 24-hour cached recommendations
"""
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import AsyncGenerator

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.account import Account
from app.models.ai_recommendation import AIRecommendation
from app.models.credit_card import CreditCard
from app.models.expense import Expense, ExpenseCategory
from app.models.goal import Goal
from app.models.income import Income
from app.models.insurance import Insurance
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.net_worth_history import NetWorthHistory

logger = logging.getLogger(__name__)

_3M_AGO = lambda: date.today() - timedelta(days=90)


# ── financial context builder ─────────────────────────────────────────────────

def get_financial_context(db: Session, user_id: int) -> dict:
    today = date.today()
    since = _3M_AGO()

    # Income (3-month avg)
    inc_total = db.query(func.sum(Income.amount)).filter(
        Income.user_id == user_id, Income.date >= since
    ).scalar() or 0
    monthly_income = int(inc_total / 3)

    # Expense (3-month avg) + by category
    exp_total = db.query(func.sum(Expense.amount)).filter(
        Expense.user_id == user_id, Expense.date >= since
    ).scalar() or 0
    monthly_expense = int(exp_total / 3)

    cat_rows = (
        db.query(ExpenseCategory.name, func.sum(Expense.amount).label('total'))
        .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
        .filter(Expense.user_id == user_id, Expense.date >= since)
        .group_by(ExpenseCategory.name)
        .order_by(func.sum(Expense.amount).desc())
        .limit(5)
        .all()
    )
    top_categories = [{'name': r.name, 'monthly': int(r.total / 3)} for r in cat_rows]

    # Loans
    loans = db.query(Loan).filter(Loan.user_id == user_id, Loan.outstanding_balance > 0).all()
    loan_data = [
        {
            'type':         l.loan_type.value if hasattr(l.loan_type, 'value') else l.loan_type,
            'bank':         l.bank_name,
            'outstanding':  l.outstanding_balance,
            'emi':          l.emi_amount,
            'rate':         l.interest_rate,
            'remaining_months': l.remaining_tenure,
        }
        for l in loans
    ]
    total_emi = sum(l.emi_amount for l in loans)
    total_loan_outstanding = sum(l.outstanding_balance for l in loans)

    # Investments
    investments = db.query(Investment).filter(Investment.user_id == user_id).all()
    total_invested     = sum(i.invested_amount for i in investments)
    total_current_val  = sum(i.current_value   for i in investments)
    inv_by_type: dict[str, int] = {}
    for inv in investments:
        t = inv.investment_type.value if hasattr(inv.investment_type, 'value') else inv.investment_type
        inv_by_type[t] = inv_by_type.get(t, 0) + inv.current_value

    # Credit cards
    cards = db.query(CreditCard).filter(CreditCard.user_id == user_id, CreditCard.is_active == True).all()
    total_cc_outstanding = sum(c.outstanding_balance for c in cards)
    total_cc_limit       = sum(c.credit_limit for c in cards)
    cc_utilization       = round(total_cc_outstanding / total_cc_limit * 100, 1) if total_cc_limit else 0

    # Liquid balance
    liquid = db.query(func.sum(Account.balance)).filter(
        Account.user_id == user_id, Account.is_active == True
    ).scalar() or 0

    # Net worth (latest snapshot)
    nw = (
        db.query(NetWorthHistory)
        .filter(NetWorthHistory.user_id == user_id)
        .order_by(NetWorthHistory.recorded_date.desc())
        .first()
    )

    # Goals
    goals = db.query(Goal).filter(Goal.user_id == user_id, Goal.status == 'active').all()
    goal_data = [
        {
            'name':     g.name,
            'target':   g.target_amount,
            'current':  g.current_amount,
            'progress': round(g.current_amount / g.target_amount * 100, 1) if g.target_amount else 0,
        }
        for g in goals
    ]

    # Insurance
    active_insurance = db.query(Insurance).filter(
        Insurance.user_id == user_id, Insurance.renewal_date >= today
    ).all()
    has_health = any(i.insurance_type.value == 'health' for i in active_insurance)
    has_life   = any(i.insurance_type.value == 'life'   for i in active_insurance)

    # Emergency fund
    months_covered = round(liquid / monthly_expense, 1) if monthly_expense > 0 else 0

    savings = monthly_income - monthly_expense
    savings_rate = round(savings / monthly_income * 100, 1) if monthly_income else 0
    dti = round(total_emi / monthly_income * 100, 1) if monthly_income else 0

    return {
        'today':               today.isoformat(),
        'monthly_income':      monthly_income,
        'monthly_expense':     monthly_expense,
        'monthly_savings':     savings,
        'savings_rate':        savings_rate,
        'top_expense_categories': top_categories,
        'loans':               loan_data,
        'total_emi':           total_emi,
        'total_loan_outstanding': total_loan_outstanding,
        'dti_pct':             dti,
        'total_invested':      total_invested,
        'total_investment_value': total_current_val,
        'investments_by_type': inv_by_type,
        'cc_outstanding':      total_cc_outstanding,
        'cc_limit':            total_cc_limit,
        'cc_utilization_pct':  cc_utilization,
        'liquid_balance':      liquid,
        'net_worth':           nw.net_worth if nw else 0,
        'months_emergency_fund': months_covered,
        'goals':               goal_data,
        'has_health_insurance': has_health,
        'has_life_insurance':   has_life,
    }


def _rupees(paise: int) -> str:
    """Format paise as ₹X,XX,XXX string."""
    r = paise // 100
    # Indian format
    s = str(r)
    if len(s) <= 3:
        return f'₹{s}'
    last3 = s[-3:]
    rest   = s[:-3]
    parts  = []
    while len(rest) > 2:
        parts.append(rest[-2:])
        rest = rest[:-2]
    if rest:
        parts.append(rest)
    return '₹' + ','.join(reversed(parts)) + ',' + last3


def format_system_prompt(ctx: dict, user_name: str | None = None) -> str:
    name = user_name or 'the user'
    lines = [
        f"You are ArthaA, a personal finance advisor for {name} in India.",
        f"Today is {ctx['today']}. Indian fiscal year runs April–March.",
        "",
        "== USER'S LIVE FINANCIAL DATA ==",
        f"Monthly Income (3-mo avg):  {_rupees(ctx['monthly_income'])}",
        f"Monthly Expense (3-mo avg): {_rupees(ctx['monthly_expense'])}",
        f"Monthly Savings:            {_rupees(ctx['monthly_savings'])} ({ctx['savings_rate']}% savings rate)",
        "",
        "Top expense categories:",
    ]
    for cat in ctx['top_expense_categories']:
        lines.append(f"  • {cat['name']}: {_rupees(cat['monthly'])}/mo")

    lines += [
        "",
        f"Liquid bank balance: {_rupees(ctx['liquid_balance'])} ({ctx['months_emergency_fund']} months of expenses)",
        f"Net Worth:           {_rupees(ctx['net_worth'])}",
        "",
        "Loans:",
    ]
    if ctx['loans']:
        for l in ctx['loans']:
            lines.append(
                f"  • {l['type'].title()} @ {l['bank']}: {_rupees(l['outstanding'])} outstanding, "
                f"{_rupees(l['emi'])}/mo EMI, {l['rate']}% p.a., {l['remaining_months']} months left"
            )
        lines.append(f"  Total EMI burden: {_rupees(ctx['total_emi'])}/mo ({ctx['dti_pct']}% of income)")
    else:
        lines.append("  No active loans")

    lines += [
        "",
        f"Investments: {_rupees(ctx['total_investment_value'])} current value (invested {_rupees(ctx['total_invested'])})",
    ]
    for itype, val in ctx['investments_by_type'].items():
        lines.append(f"  • {itype}: {_rupees(val)}")

    if ctx['cc_limit'] > 0:
        lines += [
            "",
            f"Credit Cards: {_rupees(ctx['cc_outstanding'])} outstanding / {_rupees(ctx['cc_limit'])} limit ({ctx['cc_utilization_pct']}% utilization)",
        ]

    if ctx['goals']:
        lines += ["", "Financial Goals:"]
        for g in ctx['goals']:
            lines.append(f"  • {g['name']}: {g['progress']}% complete ({_rupees(g['current'])} of {_rupees(g['target'])})")

    lines += [
        "",
        f"Insurance: Health={'✓' if ctx['has_health_insurance'] else '✗'}  Life={'✓' if ctx['has_life_insurance'] else '✗'}",
        "",
        "== INSTRUCTIONS ==",
        "• Answer using ONLY the data above — never invent numbers.",
        "• Be specific, actionable, and concise (2-4 sentences unless asked for detail).",
        "• Use Indian financial context: SIP, PPF, NPS, 80C, section 87A, etc.",
        "• End each response by citing which data you used (e.g. 'Based on your loan data...').",
        "• If asked for something outside your data, say so clearly.",
    ]
    return '\n'.join(lines)


# ── streaming chat ────────────────────────────────────────────────────────────

async def stream_chat(
    ctx: dict,
    user_name: str | None,
    message: str,
    history: list[dict],
) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted chunks from Ollama streaming chat."""
    system = format_system_prompt(ctx, user_name)
    messages = [
        {'role': 'system', 'content': system},
        *history[-10:],   # last 10 turns for context window
        {'role': 'user',   'content': message},
    ]
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                'POST',
                f'{settings.OLLAMA_BASE_URL}/api/chat',
                json={'model': settings.OLLAMA_MODEL, 'messages': messages, 'stream': True},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                        text  = chunk.get('message', {}).get('content', '')
                        done  = chunk.get('done', False)
                        if text:
                            yield f'data: {json.dumps({"text": text})}\n\n'
                        if done:
                            yield 'data: [DONE]\n\n'
                            return
                    except (json.JSONDecodeError, KeyError):
                        continue
    except httpx.ConnectError:
        # Ollama not running — return helpful fallback
        yield f'data: {json.dumps({"text": _offline_reply(message, ctx)})}\n\n'
        yield 'data: [DONE]\n\n'
    except Exception as e:
        logger.error('Stream chat error: %s', e)
        yield f'data: {json.dumps({"text": "Sorry, the AI advisor is temporarily unavailable. Please try again."})}\n\n'
        yield 'data: [DONE]\n\n'


def _offline_reply(message: str, ctx: dict) -> str:
    """Basic rule-based reply when Ollama is offline."""
    msg = message.lower()
    if any(w in msg for w in ['savings', 'save more', 'saving rate']):
        rate = ctx['savings_rate']
        if rate >= 20:
            return f"Your savings rate is {rate}% — that's healthy! Aim to invest the surplus in a diversified SIP for long-term wealth creation. (Based on your income/expense data)"
        return f"Your savings rate is {rate}%, below the recommended 20%. Review your top expense categories and set spending limits per category. (Based on your income/expense data)"
    if any(w in msg for w in ['loan', 'emi', 'debt']):
        if ctx['loans']:
            highest = max(ctx['loans'], key=lambda l: l['rate'])
            return f"Focus on prepaying your {highest['bank']} {highest['type']} loan at {highest['rate']}% — the highest rate. Even ₹10,000/month extra can save significant interest. (Based on your loan data)"
        return "You have no active loans — great position to build wealth through investments!"
    if any(w in msg for w in ['tax', '80c', 'deduction']):
        return f"You can save up to ₹1,50,000 under Section 80C (PPF, ELSS, NPS). You currently have {_rupees(ctx['total_invested'])} invested. NPS offers an additional ₹50,000 under 80CCD(1B). (Based on your investment data)"
    if any(w in msg for w in ['emergency', 'fund']):
        months = ctx['months_emergency_fund']
        return f"Your emergency fund covers {months} months of expenses. The recommended minimum is 6 months — keep emergency funds in a liquid savings account or liquid mutual fund."
    return f"Your net worth is {_rupees(ctx['net_worth'])} with a {ctx['savings_rate']}% savings rate. For specific advice, please ensure Ollama is running (ollama serve) with the {settings.OLLAMA_MODEL} model."


# ── recommendations ───────────────────────────────────────────────────────────

def _fresh_recommendations(ctx: dict) -> list[dict]:
    """Generate rule-based recommendations always — no AI needed."""
    recs = []

    # Savings rate
    if ctx['savings_rate'] < 10:
        recs.append({
            'type':     'savings_alert',
            'priority': 'high',
            'title':    f"Low savings rate: {ctx['savings_rate']}%",
            'body':     f"You're saving only {ctx['savings_rate']}% of your income. Target at least 20%. "
                        f"Your top expense is {ctx['top_expense_categories'][0]['name'] if ctx['top_expense_categories'] else 'unknown'} — review if it can be reduced.",
            'icon':     '💰',
            'data_source': 'income & expense data',
        })
    elif ctx['savings_rate'] >= 30:
        recs.append({
            'type':     'savings_good',
            'priority': 'low',
            'title':    f"Excellent savings rate: {ctx['savings_rate']}%",
            'body':     f"You're saving {_rupees(ctx['monthly_savings'])}/month. Put this surplus into a diversified SIP for inflation-beating returns.",
            'icon':     '🎉',
            'data_source': 'income & expense data',
        })

    # Emergency fund
    months = ctx['months_emergency_fund']
    if months < 3:
        recs.append({
            'type':     'emergency_fund',
            'priority': 'high',
            'title':    f"Emergency fund critically low: {months} months",
            'body':     f"Your liquid balance of {_rupees(ctx['liquid_balance'])} covers only {months} months of expenses. "
                        f"Build to 6 months ({_rupees(ctx['monthly_expense'] * 6)}) before investing aggressively.",
            'icon':     '🚨',
            'data_source': 'account balances & expense data',
        })
    elif months < 6:
        recs.append({
            'type':     'emergency_fund',
            'priority': 'medium',
            'title':    f"Build emergency fund to 6 months ({months} now)",
            'body':     f"You need {_rupees(ctx['monthly_expense'] * (6 - months))} more to reach the 6-month safety net. "
                        f"Park it in a liquid mutual fund for easy access and better returns than savings.",
            'icon':     '🛡️',
            'data_source': 'account balances',
        })

    # Debt-to-income
    if ctx['dti_pct'] > 40:
        highest_rate_loan = max(ctx['loans'], key=lambda l: l['rate']) if ctx['loans'] else None
        tip = f" Start with the {highest_rate_loan['bank']} {highest_rate_loan['type']} at {highest_rate_loan['rate']}% — highest interest rate." if highest_rate_loan else ""
        recs.append({
            'type':     'high_emi',
            'priority': 'high',
            'title':    f"EMI burden high: {ctx['dti_pct']}% of income",
            'body':     f"Your monthly EMI of {_rupees(ctx['total_emi'])} is {ctx['dti_pct']}% of income — above the safe 40% limit.{tip}",
            'icon':     '🏦',
            'data_source': 'loan data',
        })

    # Credit card utilization
    if ctx['cc_utilization_pct'] > 50:
        recs.append({
            'type':     'cc_utilization',
            'priority': 'high' if ctx['cc_utilization_pct'] > 75 else 'medium',
            'title':    f"Credit card utilization at {ctx['cc_utilization_pct']}%",
            'body':     f"High utilization hurts your credit score. You owe {_rupees(ctx['cc_outstanding'])} on cards with {_rupees(ctx['cc_limit'])} limit. "
                        f"Pay the full statement balance every month — CC interest is 36-42% p.a.",
            'icon':     '💳',
            'data_source': 'credit card data',
        })

    # Insurance gaps
    if not ctx['has_health_insurance']:
        recs.append({
            'type':     'insurance',
            'priority': 'high',
            'title':    "No health insurance detected",
            'body':     "Medical emergencies can wipe out years of savings. A family floater of ₹10 lakh "
                        "costs ₹15,000–25,000/year — add it under Insurance.",
            'icon':     '🏥',
            'data_source': 'insurance data',
        })
    if not ctx['has_life_insurance'] and ctx['monthly_income'] > 0:
        recs.append({
            'type':     'insurance_life',
            'priority': 'medium',
            'title':    "Consider term life insurance",
            'body':     "A pure term plan of ₹1 Cr coverage costs ₹8,000–15,000/year for a 30-year-old. "
                        "It protects your family's financial future if something happens to you.",
            'icon':     '❤️',
            'data_source': 'insurance data',
        })

    # 80C opportunity
    inv_80c_types = {'PPF', 'EPF', 'NPS', 'FD', 'PostOffice', 'MutualFund', 'SIP'}
    inv_80c_total = sum(v for k, v in ctx['investments_by_type'].items() if k in inv_80c_types)
    limit_80c     = 150_000 * 100
    if inv_80c_total < limit_80c and ctx['monthly_income'] > 0:
        gap = limit_80c - inv_80c_total
        recs.append({
            'type':     'tax_saving',
            'priority': 'medium',
            'title':    f"₹{gap//100:,} 80C investment opportunity",
            'body':     f"You can invest {_rupees(gap)} more in 80C instruments (PPF, ELSS, NPS, FD) to claim the full ₹1.5L tax deduction. "
                        f"At 30% tax bracket this saves ₹{int(gap * 0.30 / 100):,} in tax.",
            'icon':     '🧾',
            'data_source': 'investment data',
        })

    # Goals behind schedule
    for g in ctx['goals']:
        if g['progress'] < 25:
            recs.append({
                'type':     'goal_behind',
                'priority': 'low',
                'title':    f"Goal '{g['name']}' only {g['progress']}% funded",
                'body':     f"You've saved {_rupees(g['current'])} of {_rupees(g['target'])}. "
                            f"Set up a monthly SIP linked to this goal to stay on track.",
                'icon':     '🎯',
                'data_source': 'goals data',
            })

    # Positive if nothing to fix
    if not recs:
        recs.append({
            'type':     'all_good',
            'priority': 'low',
            'title':    "Your finances are in great shape!",
            'body':     f"Savings rate {ctx['savings_rate']}%, emergency fund {ctx['months_emergency_fund']} months, "
                        f"net worth {_rupees(ctx['net_worth'])}. Review your investment allocation quarterly.",
            'icon':     '🏆',
            'data_source': 'all financial data',
        })

    return sorted(recs, key=lambda r: {'high': 0, 'medium': 1, 'low': 2}[r['priority']])


def get_recommendations(db: Session, user_id: int, force_refresh: bool = False) -> list[dict]:
    """Return cached recommendations (24h TTL) or generate fresh ones."""
    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=settings.AI_CACHE_TTL_HOURS)

    if not force_refresh:
        cached = (
            db.query(AIRecommendation)
            .filter(
                AIRecommendation.user_id == user_id,
                AIRecommendation.recommendation_type == 'auto_insight',
                AIRecommendation.expires_at > now,
            )
            .order_by(AIRecommendation.created_at.desc())
            .all()
        )
        if cached:
            return [r.content for r in cached]

    # Generate fresh
    ctx  = get_financial_context(db, user_id)
    recs = _fresh_recommendations(ctx)

    # Delete old auto-insights
    db.query(AIRecommendation).filter(
        AIRecommendation.user_id == user_id,
        AIRecommendation.recommendation_type == 'auto_insight',
    ).delete()

    expires = now + timedelta(hours=settings.AI_CACHE_TTL_HOURS)
    for rec in recs:
        db.add(AIRecommendation(
            user_id=user_id,
            recommendation_type='auto_insight',
            title=rec['title'],
            content=rec,
            ai_model='rule-based',
            expires_at=expires,
        ))
    db.commit()
    return recs
