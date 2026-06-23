"""
Indian bank credit card SMS transaction parser.

Handles SMS formats from: HDFC, SBI, ICICI, Axis, Kotak, Yes, IDFC, IndusInd,
Standard Chartered, Citi, RBL, AU Small Finance, Federal, BOB, Canara.

Returns structured transaction data for auto-import.
"""
import re
import logging
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger(__name__)

# ── Amount extraction ─────────────────────────────────────────────────────────

_AMT_PAT = re.compile(
    r'(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)',
    re.IGNORECASE,
)


def _parse_amount(text: str) -> Optional[int]:
    m = _AMT_PAT.search(text)
    if not m:
        return None
    clean = m.group(1).replace(',', '')
    try:
        return int(round(float(clean) * 100))
    except ValueError:
        return None


# ── Card last-4 extraction ────────────────────────────────────────────────────

_LAST4_PAT = re.compile(
    r'(?:a/?c|card|account|credit\s+card|acct)'
    r'[^0-9]*?(?:XX|x+|\*+|ending\s*)(\d{4})',
    re.IGNORECASE,
)
# Fallback: any 4-digit block after XX / ** / x
_LAST4_FALLBACK = re.compile(r'(?:XX|\*\*|xx)(\d{4})', re.IGNORECASE)


def _parse_last4(text: str) -> Optional[str]:
    m = _LAST4_PAT.search(text)
    if m:
        return m.group(1)
    m = _LAST4_FALLBACK.search(text)
    return m.group(1) if m else None


# ── Date extraction ───────────────────────────────────────────────────────────

_MONTHS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}

_DATE_PATTERNS = [
    # DD-Mon-YYYY / DD-Mon-YY / DD Mon YYYY
    re.compile(r'\b(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,](\d{2,4})\b', re.IGNORECASE),
    # DD/MM/YYYY
    re.compile(r'\b(\d{2})[/-](\d{2})[/-](\d{4})\b'),
    # DD/MM/YY
    re.compile(r'\b(\d{2})[/-](\d{2})[/-](\d{2})\b'),
    # Mon DD, YYYY / Jun 22, 2026
    re.compile(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b', re.IGNORECASE),
]


def _parse_date(text: str) -> Optional[date]:
    for pat in _DATE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        try:
            groups = m.groups()
            if len(groups) == 3:
                # Check if first group is a month name
                if groups[0].isalpha():
                    mon = _MONTHS.get(groups[0].lower()[:3])
                    if mon:
                        return date(int(groups[2]), mon, int(groups[1]))
                else:
                    # Could be DD-Mon-YYYY or DD/MM/YYYY
                    if groups[1].isalpha():
                        mon = _MONTHS.get(groups[1].lower()[:3])
                        if mon:
                            yr = int(groups[2])
                            if yr < 100:
                                yr += 2000
                            return date(yr, mon, int(groups[0]))
                    else:
                        yr = int(groups[2])
                        if yr < 100:
                            yr += 2000
                        return date(yr, int(groups[1]), int(groups[0]))
        except (ValueError, IndexError):
            continue
    return None


# ── Merchant extraction ───────────────────────────────────────────────────────

# Patterns that typically precede a merchant name in CC SMS
_MERCHANT_PAT = re.compile(
    r'(?:at|for|merchant[:\s]+|info[:\s]+|at\s+merchant[:\s]+)'
    r'\s*([A-Z0-9][A-Z0-9 *&.\-/]{1,50}?)(?:\s*(?:on|\.|\bINR\b|\bRs\b|avl|available|Avl|limit|bal|$))',
    re.IGNORECASE,
)
# Backup: content between "at " and "on date"
_MERCHANT_BACKUP = re.compile(
    r'\bat\s+([A-Z][A-Z0-9 *&.\-/]{1,40?})\s+on\b',
    re.IGNORECASE,
)


def _parse_merchant(text: str) -> Optional[str]:
    for pat in (_MERCHANT_PAT, _MERCHANT_BACKUP):
        m = pat.search(text)
        if m:
            merchant = m.group(1).strip().rstrip('.,- ')
            if len(merchant) >= 2:
                return merchant
    return None


# ── Available balance/limit ───────────────────────────────────────────────────

_AVL_BAL_PAT = re.compile(
    r'(?:avl\.?\s*(?:bal(?:ance)?|limit|cr\.?\s*limit)|available\s+(?:balance|credit\s+limit|limit))'
    r'[:\s]*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)',
    re.IGNORECASE,
)


def _parse_available(text: str) -> Optional[int]:
    m = _AVL_BAL_PAT.search(text)
    if not m:
        return None
    clean = m.group(1).replace(',', '')
    try:
        return int(round(float(clean) * 100))
    except ValueError:
        return None


# ── Debit / Credit detection ──────────────────────────────────────────────────

_DEBIT_WORDS  = re.compile(r'\b(debit(?:ed)?|spent|used|charged|purchase|transaction)\b', re.IGNORECASE)
_CREDIT_WORDS = re.compile(r'\b(credit(?:ed)?|refund(?:ed)?|cashback|reversed|payment\s+received)\b', re.IGNORECASE)


def _is_payment(text: str) -> bool:
    """True = money came in (payment/refund), False = money went out (purchase)."""
    debits  = len(_DEBIT_WORDS.findall(text))
    credits = len(_CREDIT_WORDS.findall(text))
    return credits > debits


# ── Bank name detection ───────────────────────────────────────────────────────

_BANK_NAMES = [
    ('HDFC',          'HDFC Bank'),
    ('SBI',           'SBI'),
    ('ICICI',         'ICICI Bank'),
    ('AXIS',          'Axis Bank'),
    ('KOTAK',         'Kotak Bank'),
    ('YES ?BANK',     'Yes Bank'),
    ('YESBANK',       'Yes Bank'),
    ('IDFC',          'IDFC Bank'),
    ('INDUSIND',      'IndusInd Bank'),
    ('SCB|STANCHART', 'Standard Chartered'),
    ('CITI',          'Citi Bank'),
    ('RBL',           'RBL Bank'),
    ('AU ?BANK',      'AU Small Finance'),
    ('FEDERAL',       'Federal Bank'),
    ('BOB',           'Bank of Baroda'),
    ('CANARA',        'Canara Bank'),
    ('AMEX',          'American Express'),
]


def _parse_bank(text: str) -> Optional[str]:
    upper = text.upper()
    for pattern, name in _BANK_NAMES:
        if re.search(pattern, upper):
            return name
    return None


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_sms(sms_text: str) -> dict:
    """
    Parse a single Indian bank credit card SMS.

    Returns:
      {
        amount_paise: int | None,
        last4: str | None,
        merchant: str | None,
        date: str | None,          # ISO YYYY-MM-DD
        is_payment: bool,          # False = purchase, True = refund/payment
        bank_name: str | None,
        available_paise: int | None,
        raw: str,
        confidence: 'high' | 'medium' | 'low',
      }
    """
    text = sms_text.strip()

    amount_paise   = _parse_amount(text)
    last4          = _parse_last4(text)
    merchant       = _parse_merchant(text)
    txn_date       = _parse_date(text)
    is_pay         = _is_payment(text)
    bank           = _parse_bank(text)
    available      = _parse_available(text)

    # If no date found, default to today
    if not txn_date:
        txn_date = date.today()

    # Confidence: high if amount + last4 + merchant all found
    found = sum([amount_paise is not None, last4 is not None, merchant is not None])
    confidence = 'high' if found == 3 else ('medium' if found >= 2 else 'low')

    logger.info(
        'SMS parsed: bank=%s last4=%s amt=%s merchant=%s date=%s is_payment=%s confidence=%s',
        bank, last4, amount_paise, merchant, txn_date, is_pay, confidence,
    )

    return {
        'amount_paise':    amount_paise,
        'last4':           last4,
        'merchant':        merchant,
        'date':            txn_date.isoformat() if txn_date else None,
        'is_payment':      is_pay,
        'bank_name':       bank,
        'available_paise': available,
        'raw':             text,
        'confidence':      confidence,
    }


def parse_bulk_sms(sms_block: str) -> list[dict]:
    """
    Split a block of pasted SMS messages (separated by blank lines or '---')
    and parse each one. Returns only results with at least medium confidence.
    """
    # Split on blank lines or explicit separator
    raw_chunks = re.split(r'\n{2,}|---+', sms_block.strip())
    results = []
    for chunk in raw_chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        result = parse_sms(chunk)
        if result['confidence'] != 'low' and result['amount_paise']:
            results.append(result)
    return results
