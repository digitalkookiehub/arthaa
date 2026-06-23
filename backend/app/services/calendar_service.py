"""
Financial Calendar service.

Derives financial events from existing models — no new table needed.
"""
import calendar
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.credit_card import CreditCard
from app.models.goal import Goal
from app.models.insurance import Insurance
from app.models.loan import Loan, RepaymentSchedule
from app.models.insurance import Subscription

# ── event type metadata ───────────────────────────────────────────────────────

_TYPES: dict[str, dict] = {
    "cc_due":        {"label": "Credit Card Due",    "icon": "💳", "color": "#e53e3e"},
    "loan_emi":      {"label": "Loan EMI",           "icon": "🏦", "color": "#3182ce"},
    "subscription":  {"label": "Subscription",       "icon": "🔄", "color": "#805ad5"},
    "insurance":     {"label": "Insurance Renewal",  "icon": "🛡️", "color": "#319795"},
    "goal_deadline": {"label": "Goal Deadline",      "icon": "🎯", "color": "#d69e2e"},
    "budget_month":  {"label": "Budget Period",      "icon": "📋", "color": "#38a169"},
}


def _rupees(paise: int) -> str:
    r = paise // 100
    s = str(r)
    if len(s) <= 3:
        return f"₹{s}"
    last3 = s[-3:]
    rest = s[:-3]
    parts = []
    while len(rest) > 2:
        parts.append(rest[-2:])
        rest = rest[:-2]
    if rest:
        parts.append(rest)
    return "₹" + ",".join(reversed(parts)) + "," + last3


def _event(
    event_date: date,
    event_type: str,
    title: str,
    subtitle: str = "",
    amount_paise: int = 0,
    entity_id: int | None = None,
) -> dict[str, Any]:
    meta   = _TYPES.get(event_type, {"label": event_type, "icon": "📌", "color": "#718096"})
    today  = date.today()
    days   = (event_date - today).days
    if days < 0:
        urgency = "overdue"
    elif days <= 3:
        urgency = "critical"
    elif days <= 7:
        urgency = "urgent"
    elif days <= 14:
        urgency = "soon"
    else:
        urgency = "upcoming"

    return {
        "date":       event_date.isoformat(),
        "type":       event_type,
        "label":      meta["label"],
        "icon":       meta["icon"],
        "color":      meta["color"],
        "title":      title,
        "subtitle":   subtitle,
        "amount":     amount_paise,
        "amount_str": _rupees(amount_paise) if amount_paise else "",
        "entity_id":  entity_id,
        "is_overdue": days < 0,
        "days_away":  days,
        "urgency":    urgency,
    }


def _add_months(d: date, months: int) -> date:
    y = d.year + (d.month + months - 1) // 12
    m = (d.month + months - 1) % 12 + 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def _day_in_month(day: int, ref: date) -> date:
    last = calendar.monthrange(ref.year, ref.month)[1]
    return date(ref.year, ref.month, min(day, last))


# ── main ──────────────────────────────────────────────────────────────────────

def get_events(db: Session, user_id: int, from_date: date, to_date: date) -> list[dict]:
    events: list[dict] = []
    today  = date.today()

    # ── Credit cards ──────────────────────────────────────────────────────────
    cards = db.query(CreditCard).filter(
        CreditCard.user_id == user_id,
        CreditCard.is_active == True,
    ).all()

    for card in cards:
        if not card.due_date:
            continue
        # generate one event per month in range
        cursor = date(from_date.year, from_date.month, 1)
        while cursor <= to_date:
            due = _day_in_month(card.due_date, cursor)
            if from_date <= due <= to_date:
                events.append(_event(
                    due, "cc_due",
                    title=f"{card.bank_name} — {card.card_name} Payment Due",
                    subtitle=(
                        f"Min due: {_rupees(card.minimum_due)} · "
                        f"Outstanding: {_rupees(card.outstanding_balance)}"
                    ),
                    amount_paise=card.outstanding_balance,
                    entity_id=card.id,
                ))
            y = cursor.year + (cursor.month // 12)
            m = cursor.month % 12 + 1
            cursor = date(y, m, 1)

    # ── Loans — use RepaymentSchedule if available, else derive from start_date ──
    loans = db.query(Loan).filter(
        Loan.user_id == user_id,
        Loan.outstanding_balance > 0,
    ).all()

    for loan in loans:
        # Try repayment schedule for exact dates
        scheduled = db.query(RepaymentSchedule).filter(
            RepaymentSchedule.loan_id == loan.id,
            RepaymentSchedule.paid == False,
            RepaymentSchedule.due_date >= from_date,
            RepaymentSchedule.due_date <= to_date,
        ).all()

        loan_label = f"{loan.bank_name} {loan.loan_type.value.title()} EMI"
        sub = f"Outstanding: {_rupees(loan.outstanding_balance)} · {loan.remaining_tenure}m left"

        if scheduled:
            for s in scheduled:
                events.append(_event(
                    s.due_date, "loan_emi",
                    title=loan_label,
                    subtitle=sub,
                    amount_paise=loan.emi_amount,
                    entity_id=loan.id,
                ))
        else:
            # Derive from start_date day — standard Indian bank practice
            emi_day = loan.start_date.day
            cursor  = date(from_date.year, from_date.month, 1)
            while cursor <= to_date:
                emi_date = _day_in_month(emi_day, cursor)
                if from_date <= emi_date <= to_date:
                    events.append(_event(
                        emi_date, "loan_emi",
                        title=loan_label,
                        subtitle=sub,
                        amount_paise=loan.emi_amount,
                        entity_id=loan.id,
                    ))
                y = cursor.year + (cursor.month // 12)
                m = cursor.month % 12 + 1
                cursor = date(y, m, 1)

    # ── Subscriptions ─────────────────────────────────────────────────────────
    subs = db.query(Subscription).filter(
        Subscription.user_id == user_id,
        Subscription.is_active == True,
    ).all()

    for sub in subs:
        d = sub.next_billing_date
        # walk forward until we cover the range
        while d <= to_date:
            if d >= from_date:
                events.append(_event(
                    d, "subscription",
                    title=sub.name,
                    subtitle=f"{sub.billing_cycle.title()} · {sub.category or 'Subscription'}",
                    amount_paise=sub.amount,
                    entity_id=sub.id,
                ))
            cycle = sub.billing_cycle
            if cycle == 'weekly':
                d += timedelta(weeks=1)
            elif cycle == 'quarterly':
                d = _add_months(d, 3)
            elif cycle == 'half_yearly':
                d = _add_months(d, 6)
            elif cycle == 'yearly':
                d = _add_months(d, 12)
            else:
                d = _add_months(d, 1)

    # ── Insurance renewals ────────────────────────────────────────────────────
    insurances = db.query(Insurance).filter(
        Insurance.user_id == user_id,
        Insurance.renewal_date >= from_date,
        Insurance.renewal_date <= to_date,
    ).all()

    for ins in insurances:
        itype = ins.insurance_type.value if hasattr(ins.insurance_type, 'value') else ins.insurance_type
        events.append(_event(
            ins.renewal_date, "insurance",
            title=f"{ins.provider} {itype.title()} Insurance Renewal",
            subtitle=(
                f"Policy: {ins.policy_number or '—'}"
                + (f" · Coverage: {_rupees(ins.coverage_amount)}" if ins.coverage_amount else "")
            ),
            amount_paise=ins.premium_amount,
            entity_id=ins.id,
        ))

    # ── Goals with target dates ───────────────────────────────────────────────
    goals = db.query(Goal).filter(
        Goal.user_id == user_id,
        Goal.status == 'active',
        Goal.target_date != None,
        Goal.target_date >= from_date,
        Goal.target_date <= to_date,
    ).all()

    for goal in goals:
        pct = round(goal.current_amount / goal.target_amount * 100) if goal.target_amount else 0
        events.append(_event(
            goal.target_date, "goal_deadline",
            title=f"Goal: {goal.name}",
            subtitle=f"Progress: {pct}% · {_rupees(goal.target_amount - goal.current_amount)} remaining",
            amount_paise=goal.target_amount - goal.current_amount,
            entity_id=goal.id,
        ))

    # ── Budgets — mark the 1st of each month that has a budget ───────────────
    budgets = db.query(Budget).filter(Budget.user_id == user_id).all()
    budget_months: set[tuple[int, int]] = set()
    for b in budgets:
        budget_months.add((b.year, b.month))

    for (y, m) in sorted(budget_months):
        first = date(y, m, 1)
        if from_date <= first <= to_date:
            events.append(_event(
                first, "budget_month",
                title="Budget Period Starts",
                subtitle=f"{first.strftime('%B %Y')} — review your spending limits",
            ))

    return events
