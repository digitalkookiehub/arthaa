"""
Indian EMI calculator — monthly reducing balance method.
EMI = P × r × (1+r)^n / ((1+r)^n - 1)
Where r = annual_rate / 12 / 100, n = tenure_months.
All monetary values in paise (integer).
"""
import math
from dataclasses import dataclass
from datetime import date

from dateutil.relativedelta import relativedelta


@dataclass
class EMIRow:
    emi_number: int
    principal: int        # paise
    interest: int         # paise
    outstanding_balance: int  # paise
    due_date: date


def calculate_emi(principal_paise: int, annual_rate: float, tenure_months: int) -> int:
    r = annual_rate / 12 / 100
    if r == 0:
        return principal_paise // tenure_months
    emi = (
        principal_paise * r * (1 + r) ** tenure_months
        / ((1 + r) ** tenure_months - 1)
    )
    return round(emi)


def generate_schedule(
    principal_paise: int,
    annual_rate: float,
    tenure_months: int,
    start_date: date,
) -> list[EMIRow]:
    emi = calculate_emi(principal_paise, annual_rate, tenure_months)
    r = annual_rate / 12 / 100
    outstanding = principal_paise
    schedule = []

    for i in range(1, tenure_months + 1):
        interest = round(outstanding * r)
        principal_component = emi - interest
        if i == tenure_months:
            principal_component = outstanding  # absorb rounding
        outstanding = max(0, outstanding - principal_component)
        due = start_date + relativedelta(months=i)
        schedule.append(
            EMIRow(
                emi_number=i,
                principal=principal_component,
                interest=interest,
                outstanding_balance=outstanding,
                due_date=due,
            )
        )
    return schedule


def simulate_prepayment(
    outstanding_paise: int,
    annual_rate: float,
    remaining_tenure: int,
    prepayment_paise: int,
) -> dict:
    new_outstanding = max(0, outstanding_paise - prepayment_paise)
    original_emi = calculate_emi(outstanding_paise, annual_rate, remaining_tenure)

    if new_outstanding == 0:
        orig_total = original_emi * remaining_tenure
        interest_saved = orig_total - outstanding_paise
        return {
            "interest_saved": max(0, interest_saved),
            "tenure_reduced": remaining_tenure,
            "new_emi": 0,
            "new_tenure": 0,
        }

    r = annual_rate / 12 / 100
    if r > 0 and original_emi > new_outstanding * r:
        new_tenure = math.ceil(
            math.log(original_emi / (original_emi - new_outstanding * r))
            / math.log(1 + r)
        )
    else:
        new_tenure = remaining_tenure

    tenure_reduced = max(0, remaining_tenure - new_tenure)
    interest_saved = tenure_reduced * original_emi

    return {
        "interest_saved": interest_saved,
        "tenure_reduced": tenure_reduced,
        "new_emi": original_emi,
        "new_tenure": new_tenure,
    }
