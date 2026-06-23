"""
Parse bank statements (PDF / CSV) to auto-detect interest rate change entries.

Detects lines like:
  "RATE CHANGED FM 7.500% TO 7.250%"
  "RATE CHANGED FROM 8.50% TO 8.00%"
  "INTEREST RATE CHANGE FM 8.000% TO 7.500%"

Returns a list of {old_rate, new_rate, effective_date, raw_text} dicts.
"""
import io
import re
import logging
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Matches the first part of SBI's split-line rate change entry:
#   Line N:   "RATE CHANGED FM 7.500% TO"
#   Line N+1: "7.250%"
# Also handles single-line variants: "RATE CHANGED FM 7.500% TO 7.250%"
_RATE_FIRST_LINE = re.compile(
    r'(?:INTEREST\s+)?RATE\s+CHANG(?:E|ED)\s+(?:FM|FROM)\s+'
    r'(\d{1,2}\.?\d*)\s*%\s+TO(?:\s+(\d{1,2}\.?\d*)\s*%)?',
    re.IGNORECASE,
)
# Matches a standalone percentage on its own line (new rate, split format)
_RATE_PCTONLY = re.compile(r'^\s*(\d{1,2}\.\d+)\s*%\s*$')

# Matches common Indian date formats
_DATE_PATTERNS = [
    (re.compile(r'\b(\d{2})[/-](\d{2})[/-](\d{4})\b'), '%d/%m/%Y'),   # DD/MM/YYYY
    (re.compile(r'\b(\d{2})[/-](\d{2})[/-](\d{2})\b'),  '%d/%m/%y'),   # DD/MM/YY
    (re.compile(
        r'\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b',
        re.IGNORECASE,
    ), '%d %b %Y'),                                                       # DD Mon YYYY
]


def _extract_date(text: str) -> Optional[date]:
    for pattern, fmt in _DATE_PATTERNS:
        m = pattern.search(text)
        if not m:
            continue
        raw = m.group(0)
        # normalise separators for strptime
        raw = re.sub(r'[/-]', '/', raw)
        try:
            return datetime.strptime(raw, fmt.replace('-', '/').replace('\\', '/')).date()
        except ValueError:
            # try alternate fmt
            try:
                return datetime.strptime(raw, '%d/%b/%Y').date()
            except ValueError:
                continue
    return None


def _lines_from_pdf(content: bytes, password: str | None = None) -> list[str]:
    import fitz
    doc = fitz.open(stream=content, filetype='pdf')
    if doc.is_encrypted:
        if not password:
            raise ValueError(
                'PDF is password-protected. '
                'Please enter the password (usually your date of birth: DDMMYYYY).'
            )
        if not doc.authenticate(password):
            raise ValueError('Incorrect PDF password. Try your date of birth (e.g. 15081990).')
    lines: list[str] = []
    for page in doc:
        lines.extend(page.get_text('text').splitlines())
    return lines


def _lines_from_text(content: bytes) -> list[str]:
    for enc in ('utf-8-sig', 'utf-8', 'latin-1', 'cp1252'):
        try:
            return content.decode(enc).splitlines()
        except UnicodeDecodeError:
            continue
    return []


_PERIOD_PAT = re.compile(
    r'(\d{2}[-/]\d{2}[-/]\d{4})\s+to\s+(\d{2}[-/]\d{2}[-/]\d{4})',
    re.IGNORECASE,
)

# Matches "EMIs outstanding: 210", "No. of installments remaining: 210",
# "Balance Tenure: 210 months", "Remaining EMIs  210" etc.
_REMAINING_TENURE_PAT = re.compile(
    r'(?:remaining\s+(?:emi|tenure|installment|month)|'
    r'emi[s]?\s+outstanding|'
    r'balance\s+tenure|'
    r'no\.?\s+of\s+(?:emi|installment)[s]?\s+(?:remaining|outstanding)|'
    r'tenor\s+remaining)'
    r'[:\s]+(\d{1,4})',
    re.IGNORECASE,
)
# Also try: a standalone large number near the word "EMI" / "months" / "tenure"
_OUTSTANDING_BALANCE_PAT = re.compile(
    r'(?:outstanding\s+(?:balance|principal)|principal\s+outstanding)'
    r'[:\s₹,]+(\d[\d,]+)',
    re.IGNORECASE,
)


def _extract_statement_period(lines: list[str]) -> tuple[Optional[date], Optional[date]]:
    """Return (start, end) date of the statement period."""
    for line in lines:
        m = _PERIOD_PAT.search(line)
        if m:
            d1 = _extract_date(m.group(1))
            d2 = _extract_date(m.group(2))
            if d1 and d2:
                return d1, d2
    return None, None


def _extract_remaining_tenure(lines: list[str]) -> Optional[int]:
    """Return remaining EMI count found in the statement, or None."""
    for line in lines:
        m = _REMAINING_TENURE_PAT.search(line)
        if m:
            val = int(m.group(1))
            if 1 <= val <= 600:   # sanity: 1–50 years
                return val
    return None


def _extract_outstanding_balance(lines: list[str]) -> Optional[int]:
    """Return outstanding principal in paise, or None."""
    for line in lines:
        m = _OUTSTANDING_BALANCE_PAT.search(line)
        if m:
            raw = m.group(1).replace(',', '')
            try:
                rupees = float(raw)
                if rupees > 1000:   # sanity: more than ₹1000
                    return int(rupees * 100)
            except ValueError:
                pass
    return None


def detect_rate_changes(content: bytes, filename: str, password: str | None = None) -> list[dict]:
    """
    Scan a bank statement for interest rate change entries.

    Returns list of dicts:
      { old_rate: float, new_rate: float,
        effective_date: str | None,   # ISO YYYY-MM-DD or None
        raw_text: str }
    Sorted by effective_date ascending (None dates go last).
    """
    fname = filename.lower().split('?')[0]
    is_pdf = fname.endswith('.pdf') or b'%PDF' in content[:1024]

    if is_pdf:
        try:
            lines = _lines_from_pdf(content, password=password)
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f'Cannot read PDF: {e}')
    else:
        lines = _lines_from_text(content)
        if not lines:
            raise ValueError('Cannot decode file. Upload a PDF or CSV bank statement.')

    changes: list[dict] = []

    for i, line in enumerate(lines):
        m = _RATE_FIRST_LINE.search(line)
        if not m:
            continue

        old_rate = float(m.group(1))

        # SBI format: new rate may be on this line OR the very next line
        if m.group(2):
            new_rate = float(m.group(2))
            raw_text = line.strip()
        else:
            # Look at next non-empty line for the percentage
            new_rate = None
            raw_text = line.strip()
            for j in range(i + 1, min(i + 4, len(lines))):
                pct_m = _RATE_PCTONLY.match(lines[j])
                if pct_m:
                    new_rate = float(pct_m.group(1))
                    raw_text = f"{line.strip()} {lines[j].strip()}"
                    break
            if new_rate is None:
                continue  # couldn't find the new rate

        # Date is in the 1-4 lines immediately before the rate-change line
        # SBI layout: [date1, date2, "RATE CHANGED FM..."]
        context = '\n'.join(lines[max(0, i - 4): i + 1])
        effective_date = _extract_date(context)

        changes.append({
            'old_rate': old_rate,
            'new_rate': new_rate,
            'effective_date': effective_date.isoformat() if effective_date else None,
            'raw_text': raw_text,
        })

    # Sort by date (None last), deduplicate by (old_rate, new_rate, effective_date)
    changes.sort(key=lambda c: c['effective_date'] or '9999-99-99')
    seen: set[tuple] = set()
    unique: list[dict] = []
    for c in changes:
        key = (c['old_rate'], c['new_rate'], c['effective_date'])
        if key not in seen:
            seen.add(key)
            unique.append(c)

    # Extract statement period, remaining tenure, outstanding balance
    period_start, period_end = _extract_statement_period(lines)
    remaining_tenure = _extract_remaining_tenure(lines)
    outstanding_balance = _extract_outstanding_balance(lines)

    logger.info('Detected %d rate change(s) from %s (period %s to %s, remaining=%s)',
                len(unique), filename, period_start, period_end, remaining_tenure)
    return {
        'changes': unique,
        'period_start': period_start.isoformat() if period_start else None,
        'period_end': period_end.isoformat() if period_end else None,
        'remaining_tenure': remaining_tenure,
        'outstanding_balance_paise': outstanding_balance,
    }
