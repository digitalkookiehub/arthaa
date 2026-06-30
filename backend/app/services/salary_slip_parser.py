"""
Indian Salary Slip PDF Parser.

Extracts net pay, gross pay, pay month, employer, and employee name
from common Indian payslip formats (Zoho, GreytHR, Keka, Darwinbox,
custom HR portals, government pay slips).
"""
import logging
import re
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

# ── month helpers ─────────────────────────────────────────────────────────────

_MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10,
    'november': 11, 'december': 12,
}

# Patterns for "Month Year" or "MM/YYYY" or "YYYY-MM"
_PAY_PERIOD_PATS = [
    # "January 2026" / "Jan 2026" / "Jan-2026"
    re.compile(
        r'\b(January|February|March|April|May|June|July|August|September|'
        r'October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
        r'[\s\-,]+(\d{4})\b', re.I
    ),
    # "01/2026" or "01-2026"
    re.compile(r'\b(0?[1-9]|1[0-2])[/\-](\d{4})\b'),
    # "2026-01" or "2026/01"
    re.compile(r'\b(\d{4})[/\-](0?[1-9]|1[0-2])\b'),
    # "Pay Period: 01 Jan 2026 to 31 Jan 2026" → grab first date
    re.compile(
        r'(?:pay\s*period|salary\s*(?:month|period)|for\s*the\s*month)[^\d]*'
        r'(\d{1,2})[\s\-/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-/](\d{4})',
        re.I
    ),
]

def _extract_pay_date(text: str) -> Optional[date]:
    for pat in _PAY_PERIOD_PATS:
        m = pat.search(text)
        if not m:
            continue
        g = m.groups()
        try:
            if len(g) == 2:
                a, b = g
                # check if a is month-name
                mon_name = a.lower()[:3]
                if mon_name in _MONTH_MAP:
                    mon, yr = _MONTH_MAP[mon_name], int(b)
                else:
                    # numeric — figure out which is month vs year
                    ia, ib = int(a), int(b)
                    if ib > 100:          # b is year
                        mon, yr = ia, ib
                    else:                 # a is year
                        mon, yr = ib, ia
            else:
                # 3-group pattern: day, month-name, year
                _, mon_str, yr_str = g
                mon = _MONTH_MAP.get(mon_str.lower()[:3])
                yr  = int(yr_str)
                if not mon:
                    continue

            if 1 <= mon <= 12 and 2000 <= yr <= 2100:
                return date(yr, mon, 1)
        except (ValueError, TypeError):
            continue
    return None


# ── amount helpers ────────────────────────────────────────────────────────────

_AMT_PAT = re.compile(r'[\d,]+(?:\.\d{1,2})?')

def _parse_inr(text: str) -> Optional[int]:
    """Extract first rupee amount from text → paise."""
    clean = re.sub(r'[₹,\s]', '', text).strip()
    # strip trailing Dr/Cr
    clean = re.sub(r'(Dr|Cr)$', '', clean, flags=re.I)
    try:
        val = float(clean)
        return int(round(val * 100)) if val > 0 else None
    except ValueError:
        return None

def _first_amount_after(text: str, keyword_end: int) -> Optional[int]:
    """Find first INR amount in the 120 chars after a keyword match."""
    snippet = text[keyword_end: keyword_end + 120]
    m = _AMT_PAT.search(snippet)
    if m:
        return _parse_inr(m.group())
    return None


# ── keyword patterns ──────────────────────────────────────────────────────────

# Net pay labels — ordered most-specific first
_NET_PAY_KW = re.compile(
    r'\b(Net\s*(?:Pay|Salary|Amount|Earnings|Payable|Take\s*Home)|'
    r'Take\s*Home\s*(?:Pay|Salary)?|'
    r'Amount\s*(?:Payable|Credited|Transferred)|'
    r'Net\s*(?:Disbursement|Remittance)|'
    r'Total\s*Net\s*(?:Pay|Salary)|'
    r'In\s*Hand\s*(?:Salary)?)\b', re.I
)

# Gross pay labels
_GROSS_PAY_KW = re.compile(
    r'\b(Gross\s*(?:Pay|Salary|Earnings|CTC|Total)|'
    r'Total\s*(?:Gross|Earnings|CTC)|'
    r'CTC\s*(?:Per\s*Month|Monthly)?)\b', re.I
)

# Total deductions line
_TOTAL_DED_KW = re.compile(
    r'\b(Total\s*Deductions?|Deductions?\s*Total|Total\s*Deducted)\b', re.I
)

# Individual deduction components — (pattern, display_label)
_DEDUCTION_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\b(Provident\s*Fund|EPF|PF\s*(?:Employee|Deduction)?|Employee\s*PF)\b', re.I), 'Provident Fund (EPF)'),
    (re.compile(r'\b(Employer\s*PF|Employer\s*Provident\s*Fund)\b', re.I), 'Employer PF'),
    (re.compile(r'\b(TDS|Tax\s*Deducted\s*(?:at\s*Source)?|Income\s*Tax\s*(?:Deducted)?|IT\s*Deduction)\b', re.I), 'TDS / Income Tax'),
    (re.compile(r'\b(Professional\s*Tax|Prof\s*Tax|PT\s*(?:Deduction)?|P\.?Tax)\b', re.I), 'Professional Tax'),
    (re.compile(r'\b(ESI|ESIC|Employee\s*State\s*Insurance)\b', re.I), 'ESI'),
    (re.compile(r'\b(LWF|Labour\s*Welfare\s*Fund|Labor\s*Welfare)\b', re.I), 'Labour Welfare Fund'),
    (re.compile(r'\b(Gratuity\s*(?:Deduction)?)\b', re.I), 'Gratuity'),
    (re.compile(r'\b(VPF|Voluntary\s*Provident\s*Fund)\b', re.I), 'VPF'),
    (re.compile(r'\b(NPS|National\s*Pension\s*(?:Scheme|System))\b', re.I), 'NPS'),
    (re.compile(r'\b(Advance\s*(?:Recovery|Deduction)|Salary\s*Advance)\b', re.I), 'Salary Advance Recovery'),
    (re.compile(r'\b(Loan\s*(?:EMI|Deduction|Recovery)|EMI\s*Deduction)\b', re.I), 'Loan EMI Deduction'),
    (re.compile(r'\b(Health\s*Insurance|Medical\s*Insurance|Group\s*Insurance|GHI)\b', re.I), 'Health Insurance'),
]

# Employer name — usually first non-trivial line or after "Company:" / "Employer:"
_EMPLOYER_KW = re.compile(
    r'(?:Company|Employer|Organisation|Organization|Firm|Entity)\s*[:\-]\s*(.+)', re.I
)

# Employee name
_EMPLOYEE_KW = re.compile(
    r'(?:Employee\s*Name|Name\s*of\s*Employee|Employee)\s*[:\-]\s*([A-Za-z\s]+)', re.I
)


def _extract_deductions(raw: str) -> tuple[list[dict], Optional[int]]:
    """
    Extract individual deduction line items and total deductions from raw text.
    Returns (deductions_list, total_deductions_paise).
    Each item: { label: str, amount_paise: int }
    """
    seen_labels: set[str] = set()
    deductions: list[dict] = []

    for pat, label in _DEDUCTION_RULES:
        for m in pat.finditer(raw):
            if label in seen_labels:
                break
            amt = _first_amount_after(raw, m.end())
            if amt and amt > 0:
                deductions.append({'label': label, 'amount_paise': amt})
                seen_labels.add(label)
                break

    # Total deductions line
    total_ded: Optional[int] = None
    for m in _TOTAL_DED_KW.finditer(raw):
        amt = _first_amount_after(raw, m.end())
        if amt and amt > 0:
            total_ded = amt
            break

    # If no total found, sum extracted items
    if not total_ded and deductions:
        total_ded = sum(d['amount_paise'] for d in deductions)

    return deductions, total_ded


# ── PDF reader ────────────────────────────────────────────────────────────────

def _pdf_text(content: bytes, password: Optional[str] = None) -> str:
    import fitz
    doc = fitz.open(stream=content, filetype='pdf')
    if doc.is_encrypted:
        if not password:
            raise ValueError('PDF is password-protected.')
        if not doc.authenticate(password):
            raise ValueError('Incorrect PDF password.')
    pages = []
    for page in doc:
        pages.append(page.get_text('text'))
    return '\n'.join(pages)


# ── main entry ────────────────────────────────────────────────────────────────

def parse_salary_slip(
    content: bytes,
    filename: str,
    password: Optional[str] = None,
) -> dict:
    """
    Parse a salary slip PDF.

    Returns:
      {
        net_pay_paise:   int | None,
        gross_pay_paise: int | None,
        pay_date:        str | None,   # "YYYY-MM-DD" (first of pay month)
        employer:        str | None,
        employee:        str | None,
        filename:        str,
        error:           str | None,
      }
    """
    result: dict = {
        'net_pay_paise':        None,
        'gross_pay_paise':      None,
        'total_deductions_paise': None,
        'deductions':           [],
        'pay_date':             None,
        'employer':             None,
        'employee':             None,
        'filename':             filename,
        'error':                None,
    }

    try:
        raw = _pdf_text(content, password)
    except ValueError as e:
        result['error'] = str(e)
        return result
    except Exception as e:
        result['error'] = f'Cannot read PDF: {e}'
        return result

    # ── pay date ──────────────────────────────────────────────────────────────
    pay_date = _extract_pay_date(raw)
    if pay_date:
        result['pay_date'] = pay_date.isoformat()

    # ── net pay ───────────────────────────────────────────────────────────────
    # Strategy 1: keyword search
    for m in _NET_PAY_KW.finditer(raw):
        amt = _first_amount_after(raw, m.end())
        if amt and amt > 100_00:           # > ₹100 (sanity check)
            result['net_pay_paise'] = amt
            break

    # Strategy 2: if still None — look for largest standalone "Total" amount
    # that is plausible as a salary (₹5,000 – ₹50,00,000)
    if not result['net_pay_paise']:
        total_kw = re.compile(r'\b(?:Total|Grand\s*Total)\b', re.I)
        candidates = []
        for m in total_kw.finditer(raw):
            amt = _first_amount_after(raw, m.end())
            if amt and 5_000_00 <= amt <= 50_00_000_00:
                candidates.append(amt)
        if candidates:
            result['net_pay_paise'] = min(candidates)  # smallest "Total" = net (after deductions)

    # ── gross pay ─────────────────────────────────────────────────────────────
    for m in _GROSS_PAY_KW.finditer(raw):
        amt = _first_amount_after(raw, m.end())
        if amt and amt > 100_00:
            result['gross_pay_paise'] = amt
            break

    # ── employer ──────────────────────────────────────────────────────────────
    em = _EMPLOYER_KW.search(raw)
    if em:
        result['employer'] = em.group(1).strip()[:100]
    else:
        # Fallback: first non-empty line of the document (usually company name)
        for line in raw.splitlines():
            line = line.strip()
            if len(line) > 3 and not re.match(r'^[\d\W]+$', line):
                result['employer'] = line[:100]
                break

    # ── employee ──────────────────────────────────────────────────────────────
    ee = _EMPLOYEE_KW.search(raw)
    if ee:
        result['employee'] = ee.group(1).strip()[:100]

    # ── deductions ────────────────────────────────────────────────────────────
    deductions, total_ded = _extract_deductions(raw)
    result['deductions']             = deductions
    result['total_deductions_paise'] = total_ded

    # Cross-check: if gross - total_ded ≈ net, we have high confidence
    if (result['gross_pay_paise'] and total_ded and result['net_pay_paise'] is None):
        implied_net = result['gross_pay_paise'] - total_ded
        if implied_net > 0:
            result['net_pay_paise'] = implied_net

    logger.info(
        'Salary slip parsed: file=%s net=%s gross=%s date=%s',
        filename, result['net_pay_paise'], result['gross_pay_paise'], result['pay_date']
    )
    return result
