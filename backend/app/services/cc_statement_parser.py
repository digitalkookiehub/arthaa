"""
Credit card statement PDF parser.

Extracts from Indian bank CC statements (HDFC, SBI, ICICI, Axis, Kotak, Yes, IDFC):
- Statement / billing date
- Payment due date
- Total amount due (outstanding)
- Minimum amount due
- Individual transactions (date, description, amount, is_credit)
"""
import re
import logging
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger(__name__)

# ── date patterns ──────────────────────────────────────────────────────────────

_DATE_PATS = [
    re.compile(r'\b(\d{1,2})[-/\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s](\d{2,4})\b', re.IGNORECASE),
    re.compile(r'\b(\d{2})[-/](\d{2})[-/](\d{4})\b'),   # DD/MM/YYYY
    re.compile(r'\b(\d{2})[-/](\d{2})[-/](\d{2})\b'),    # DD/MM/YY
]
_MONTHS = {'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
           'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}


def _parse_date(text: str) -> Optional[date]:
    text = text.strip()
    # DD Mon YYYY / DD-Mon-YY
    m = _DATE_PATS[0].search(text)
    if m:
        day = int(m.group(1))
        mon = _MONTHS.get(m.group(2).lower()[:3])
        yr  = int(m.group(3))
        if yr < 100: yr += 2000
        if mon:
            try: return date(yr, mon, day)
            except ValueError: pass
    # DD/MM/YYYY
    m = _DATE_PATS[1].search(text)
    if m:
        try: return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError: pass
    # DD/MM/YY
    m = _DATE_PATS[2].search(text)
    if m:
        try: return date(2000 + int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError: pass
    return None


def _parse_amount(text: str) -> Optional[int]:
    """Return amount in paise (int), stripping ₹, commas, Dr/Cr suffixes."""
    clean = re.sub(r'[₹,\s]', '', text)
    clean = re.sub(r'(Dr|CR|cr|dr)$', '', clean, flags=re.IGNORECASE)
    try:
        return int(round(float(clean) * 100))
    except ValueError:
        return None


def _lines_from_pdf(content: bytes, password: str | None = None) -> list[str]:
    import fitz
    doc = fitz.open(stream=content, filetype='pdf')
    if doc.is_encrypted:
        if not password:
            raise ValueError('PDF is password-protected. Enter your password (usually DOB: DDMMYYYY).')
        if not doc.authenticate(password):
            raise ValueError('Incorrect PDF password.')
    lines = []
    for page in doc:
        lines.extend(page.get_text('text').splitlines())
    return lines


# ── field extractors ───────────────────────────────────────────────────────────

# Statement / billing date
_STMT_DATE_PAT = re.compile(
    r'(?:statement\s+date|billing\s+date|bill\s+date|s\.?\s*date)'
    r'[:\s]+(.{4,30})',
    re.IGNORECASE,
)

# Payment due date
_DUE_DATE_PAT = re.compile(
    r'(?:payment\s+due\s+date|due\s+date|pay\s+by|payment\s+date)'
    r'[:\s]+(.{4,30})',
    re.IGNORECASE,
)

# Total amount due (outstanding)
_TOTAL_DUE_PAT = re.compile(
    r'(?:total\s+amount\s+due|total\s+outstanding|amount\s+payable|'
    r'total\s+due|outstanding\s+amount|closing\s+balance|'
    r'current\s+balance|balance\s+due)'
    r'[:\s₹]+([\d,]+(?:\.\d{1,2})?)',
    re.IGNORECASE,
)

# Minimum amount due
_MIN_DUE_PAT = re.compile(
    r'(?:minimum\s+(?:amount\s+)?due|min(?:\.?\s+)(?:amt\.?\s+)?due|'
    r'min(?:imum)?\s+payment)'
    r'[:\s₹]+([\d,]+(?:\.\d{1,2})?)',
    re.IGNORECASE,
)

# Credit limit
_LIMIT_PAT = re.compile(
    r'(?:credit\s+limit|total\s+credit\s+limit)'
    r'[:\s₹]+([\d,]+(?:\.\d{1,2})?)',
    re.IGNORECASE,
)

# ── transaction pattern ────────────────────────────────────────────────────────
# Typical CC transaction line:
#   15 Dec 2024   SWIGGY ORDER          500.00
#   16/12/2024    AMAZON PURCHASE      2,345.00  Cr
#   16-Dec-24     POS REFUND            -200.00

_TXN_PAT = re.compile(
    r'(?P<date>\d{1,2}[-/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]\d{2,4}'
    r'|\d{2}[-/]\d{2}[-/]\d{2,4})'
    r'\s+'
    r'(?P<desc>[A-Z0-9*./,&\-\s]{4,60?}?)'
    r'\s+'
    r'(?P<amt>[\d,]+\.\d{2})'
    r'(?P<cr>\s*(?:Cr|CR|cr))?',
    re.IGNORECASE,
)


def parse_cc_statement(content: bytes, filename: str, password: str | None = None) -> dict:
    """
    Parse a credit card statement PDF or text file.
    Returns:
      {
        statement_date: str | None,   # ISO date
        due_date: str | None,
        total_due_paise: int | None,
        min_due_paise: int | None,
        credit_limit_paise: int | None,
        transactions: [{ date, description, amount_paise, is_credit }],
      }
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
        for enc in ('utf-8-sig', 'utf-8', 'latin-1'):
            try:
                lines = content.decode(enc).splitlines()
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError('Cannot decode file.')

    full_text = '\n'.join(lines)

    # ── Extract header fields ──
    statement_date: Optional[date] = None
    m = _STMT_DATE_PAT.search(full_text)
    if m:
        statement_date = _parse_date(m.group(1))

    due_date: Optional[date] = None
    m = _DUE_DATE_PAT.search(full_text)
    if m:
        due_date = _parse_date(m.group(1))

    total_due_paise: Optional[int] = None
    m = _TOTAL_DUE_PAT.search(full_text)
    if m:
        total_due_paise = _parse_amount(m.group(1))

    min_due_paise: Optional[int] = None
    m = _MIN_DUE_PAT.search(full_text)
    if m:
        min_due_paise = _parse_amount(m.group(1))

    credit_limit_paise: Optional[int] = None
    m = _LIMIT_PAT.search(full_text)
    if m:
        credit_limit_paise = _parse_amount(m.group(1))

    # ── Extract transactions ──
    transactions = []
    seen: set[tuple] = set()

    for line in lines:
        m = _TXN_PAT.search(line)
        if not m:
            continue
        txn_date = _parse_date(m.group('date'))
        if not txn_date:
            continue
        desc = re.sub(r'\s+', ' ', m.group('desc')).strip().rstrip('.,')
        if len(desc) < 3:
            continue
        amt = _parse_amount(m.group('amt'))
        if not amt or amt <= 0:
            continue
        is_credit = bool(m.group('cr'))
        key = (txn_date.isoformat(), desc[:20], amt)
        if key in seen:
            continue
        seen.add(key)
        transactions.append({
            'date': txn_date.isoformat(),
            'description': desc,
            'amount_paise': amt,
            'is_credit': is_credit,   # True = refund/payment, False = purchase
        })

    transactions.sort(key=lambda t: t['date'])

    logger.info(
        'CC statement parsed: stmt=%s due=%s total=%s min=%s txns=%d',
        statement_date, due_date, total_due_paise, min_due_paise, len(transactions),
    )

    return {
        'statement_date': statement_date.isoformat() if statement_date else None,
        'due_date': due_date.isoformat() if due_date else None,
        'due_day': due_date.day if due_date else None,
        'total_due_paise': total_due_paise,
        'min_due_paise': min_due_paise,
        'credit_limit_paise': credit_limit_paise,
        'transactions': transactions,
    }
