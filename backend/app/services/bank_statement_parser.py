"""
Indian Bank Statement PDF Parser.

Supports HDFC, ICICI, SBI, Axis, Kotak, Yes Bank, IndusInd, IDFC, Federal, Canara.

Two distinct row formats handled:
  1. Tabular (HDFC / ICICI / Axis): S.No | Value Date | Txn Date | Cheque | Narration | Withdrawal | Deposit | Balance
  2. Date-first (SBI / Kotak / older formats): Date  Narration  Amount(Dr/Cr)  Balance

Each transaction is classified as:
  expense      — regular purchase / spend
  atm          — ATM cash withdrawal
  transfer_out — money sent via UPI/NEFT/RTGS/IMPS
  transfer_in  — money received
  income       — salary, interest, dividend, refund
  ignored      — opening/closing balance lines
"""
import logging
import re
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

# ── date helpers ──────────────────────────────────────────────────────────────

_MONTHS = {
    'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
    'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12,
    'january':1,'february':2,'march':3,'april':4,'june':6,
    'july':7,'august':8,'september':9,'october':10,'november':11,'december':12,
}

_DATE_PATS = [
    re.compile(r'\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b'),
    re.compile(r'\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})\b'),
    re.compile(r'\b(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s](\d{2,4})\b', re.I),
]


def _parse_date(text: str) -> Optional[date]:
    for pat in _DATE_PATS:
        m = pat.search(text)
        if not m:
            continue
        g = m.groups()
        try:
            if pat == _DATE_PATS[2]:
                day, mon_str, yr = int(g[0]), g[1].lower()[:3], int(g[2])
                mon = _MONTHS.get(mon_str)
                if not mon:
                    continue
                if yr < 100:
                    yr += 2000
                return date(yr, mon, day)
            else:
                day, mon, yr = int(g[0]), int(g[1]), int(g[2])
                if yr < 100:
                    yr += 2000
                if 1 <= mon <= 12 and 1 <= day <= 31:
                    return date(yr, mon, day)
        except ValueError:
            continue
    return None


def _parse_amount(text: str) -> Optional[int]:
    """Parse amount string → paise (integer)."""
    clean = re.sub(r'[₹,\s]', '', text).strip()
    clean = re.sub(r'(Dr|Cr|DR|CR)$', '', clean, flags=re.I)
    try:
        val = float(clean)
        return int(round(val * 100)) if val > 0 else None
    except ValueError:
        return None


# ── PDF reader ────────────────────────────────────────────────────────────────

def _lines_from_pdf(content: bytes, password: Optional[str] = None) -> list[str]:
    import fitz  # PyMuPDF
    doc = fitz.open(stream=content, filetype='pdf')
    if doc.is_encrypted:
        if not password:
            raise ValueError('PDF is password-protected. Enter your password (usually DOB e.g. 01011990 or PAN number).')
        if not doc.authenticate(password):
            raise ValueError('Incorrect PDF password.')
    lines = []
    for page in doc:
        lines.extend(page.get_text('text').splitlines())
    return [l.strip() for l in lines if l.strip()]


# ── amount regex helpers ──────────────────────────────────────────────────────

_AMT_PAT    = re.compile(r'([\d,]+\.\d{2})(?:\s*(?:Dr|Cr|DR|CR))?', re.I)
_DR_SUFFIX  = re.compile(r'([\d,]+\.\d{2})\s*Dr\b', re.I)
_CR_SUFFIX  = re.compile(r'([\d,]+\.\d{2})\s*Cr\b', re.I)
_CR_NARR    = re.compile(r'\bCr\b|/Cr\b|CREDIT|NEFT\s*CR|IMPS\s*CR|RTGS\s*CR|INT\s*CR|UPI\s*CR', re.I)


# ── FORMAT 1: Tabular (HDFC / ICICI / Axis) ──────────────────────────────────
#
# Columns: S.No  Value Date  Txn Date  Cheque No  Narration  Withdrawal(INR)  Deposit(INR)  Balance(INR)
#
# After PyMuPDF extraction, a typical row looks like:
#   "1  15/06/2026  15/06/2026  -  UPI-SWIGGY ORDER  500.00    9,500.00"
# or for a credit:
#   "2  16/06/2026  16/06/2026     SALARY CREDIT     50,000.00  59,500.00"

_TABULAR_HEADER = re.compile(
    r'withdrawal\s*amount|deposit\s*amount|transaction\s*remarks|s\.?\s*no\.?', re.I
)

# Matches rows that start with an S.No digit followed by two dates
_TABULAR_ROW = re.compile(
    r'^\s*(\d{1,4})\s+'                               # S No.
    r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s+'          # Value Date (group 2)
    r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s*'          # Transaction Date (group 3)
    r'(?P<rest>.+)$',
    re.IGNORECASE,
)


def _parse_tabular_row(sno: str, value_date_str: str, txn_date_str: str, rest: str) -> Optional[dict]:
    """
    Parse the 'rest' after (S.No, Value Date, Txn Date) for a tabular-format row.
    rest = "[cheque_no]  <narration>  <withdrawal_or_blank>  <deposit_or_blank>  <balance>"
    """
    txn_date = _parse_date(value_date_str) or _parse_date(txn_date_str)
    if not txn_date:
        return None

    # Strip leading cheque number (pure digits / dash / empty) — up to 15 chars before a space
    rest_clean = re.sub(r'^[\d\-]{0,15}\s+', '', rest.strip())

    # Extract all amounts from the rest
    amounts = _AMT_PAT.findall(rest_clean)
    if not amounts:
        return None

    # Remove amounts from text to isolate narration
    narration = re.sub(r'[\d,]+\.\d{2}\s*(?:Dr|Cr)?', '', rest_clean, flags=re.I)
    narration = re.sub(r'\s{2,}', ' ', narration).strip().rstrip('.,/-')

    if len(narration) < 2:
        return None

    # Determine debit/credit from separate withdrawal/deposit columns
    # Pattern: last amount = Balance; second-to-last = Deposit; third-to-last = Withdrawal
    # (when a column is blank the PDF produces only 2 amounts: the non-blank one + balance)
    is_debit: bool
    amt_paise: Optional[int]

    if len(amounts) >= 3:
        # Three or more amounts → we have both debit+credit columns visible
        # Last = balance, second-last = deposit, third-last = withdrawal
        wdl = _parse_amount(amounts[-3]) if len(amounts) >= 3 else None
        dep = _parse_amount(amounts[-2])
        # bal = amounts[-1]   # balance, ignore

        if wdl and dep:
            # Both non-zero (unusual) — use narration cue
            is_debit = not bool(_CR_NARR.search(narration))
            amt_paise = dep if not is_debit else wdl
        elif wdl:
            amt_paise, is_debit = wdl, True
        elif dep:
            amt_paise, is_debit = dep, False
        else:
            return None

    elif len(amounts) == 2:
        # Only one transaction amount + balance
        amt_paise = _parse_amount(amounts[0])
        # Detect Dr/Cr from narration
        dr_m = _DR_SUFFIX.search(rest_clean)
        cr_m = _CR_SUFFIX.search(rest_clean)
        if cr_m:
            is_debit = False
        elif dr_m:
            is_debit = True
        else:
            is_debit = not bool(_CR_NARR.search(narration))

    elif len(amounts) == 1:
        amt_paise = _parse_amount(amounts[0])
        is_debit  = not bool(_CR_NARR.search(narration))
    else:
        return None

    if not amt_paise or amt_paise <= 0:
        return None

    return {
        'date':        txn_date.isoformat(),
        'description': narration,
        'amount_paise': amt_paise,
        'is_debit':    is_debit,
    }


# ── FORMAT 2: Date-first (SBI / Kotak / older formats) ───────────────────────

_DATE_FIRST_ROW = re.compile(
    r'^(?P<date>\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}'
    r'|\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{2,4})'
    r'\s+(?P<rest>.+)$',
    re.IGNORECASE,
)


def _detect_debit_date_first(rest: str, amounts: list[str]) -> tuple[Optional[int], bool]:
    """Heuristic debit detection for date-first format rows."""
    dr_m = _DR_SUFFIX.search(rest)
    cr_m = _CR_SUFFIX.search(rest)
    if dr_m:
        return _parse_amount(dr_m.group(1)), True
    if cr_m:
        return _parse_amount(cr_m.group(1)), False

    amt_vals = [_parse_amount(a) for a in amounts]
    non_zero  = [(i, v) for i, v in enumerate(amt_vals) if v]
    if not non_zero:
        return None, True

    # With 2+ amounts: first = debit col, second = credit / balance
    if len(non_zero) >= 2:
        first_idx, first_val   = non_zero[0]
        second_idx, second_val = non_zero[1]
        if first_idx == 0 and second_idx == 1:
            # Both columns present — default to debit unless narration says credit
            is_debit = not bool(_CR_NARR.search(rest))
            return (second_val if not is_debit else first_val), is_debit

    idx, val = non_zero[0]
    if idx >= 2 and len(non_zero) == 1:
        return None, True
    return val, True


# ── classification keywords ───────────────────────────────────────────────────

_ATM_KW = re.compile(
    r'\b(ATM\s*W[DH]|ATM\s*CASH|CASH\s*WD[RL]?|CASH\s*WITHDRAWAL|ATW|'
    r'ATM\s*TXN|ATM\s*TRX|CASH\s*DISP)\b', re.I
)
# Loan EMI — checked BEFORE transfer_out so NEFT/UPI EMIs are correctly tagged
_LOAN_EMI_KW = re.compile(
    r'\b(EMI|LOAN\s*(?:EMI|REPAY|INSTALLMENT|PAYMENT)|HOME\s*LOAN|'
    r'PERSONAL\s*LOAN|CAR\s*LOAN|EDUCATION\s*LOAN|AUTO\s*LOAN|'
    r'HOUSING\s*LOAN|MORTGAGE|LOAN\s*A/C|LOANEMI|EMIPAY)\b', re.I
)
# Credit card bill payment — shown but not imported (would double-count card spends)
_CC_PAYMENT_KW = re.compile(
    r'\b(CREDIT\s*CARD\s*(?:PAYMENT|BILL|DUE|AUTOPAY)|CC\s*(?:PAYMENT|BILL|DUE)|'
    r'CREDITCARD|CCPAY|CARD\s*BILL|VISA\s*BILL|MASTERCARD\s*BILL|'
    r'AMEX\s*BILL|RUPAY\s*BILL|HDFC\s*CC|ICICI\s*CC|AXIS\s*CC|'
    r'SBI\s*CARD|CITIBANK\s*CARD|AUTOPAY.*CARD|CARD.*AUTOPAY)\b', re.I
)
_TRANSFER_OUT_KW = re.compile(
    r'\b(UPI|NEFT|RTGS|IMPS|FUND\s*TRF|FT\s*-|TRF\s*TO|TRANSFER\s*TO|'
    r'SENT\s*TO|PAYTM|PHONEPE|GOOGLEPAY|GPAY|BHIM)\b', re.I
)
_TRANSFER_IN_KW = re.compile(
    r'\b(UPI|NEFT\s*CR|RTGS\s*CR|IMPS\s*CR|RECEIVED\s*FROM|TRF\s*FROM|'
    r'TRANSFER\s*FROM|CREDIT\s*BY)\b', re.I
)
_SALARY_KW = re.compile(
    r'\b(SALARY|SAL\s*CR|PAYROLL|STIPEND|WAGES|EMOLUMENTS)\b', re.I
)
_INCOME_KW = re.compile(
    r'\b(INTEREST\s*CR|INT\s*CR|DIVIDEND|DIV\s*CR|REFUND|CASHBACK|'
    r'REWARD|REVERSAL|REV\s*CR|INCOMING)\b', re.I
)
_IGNORED_KW = re.compile(
    r'\b(OPENING\s*BAL|CLOSING\s*BAL|BALANCE\s*B/F|BALANCE\s*C/F|'
    r'BALANCE\s*BROUGHT|BALANCE\s*CARRIED|BY\s*BALANCE|TO\s*BALANCE)\b', re.I
)

# ── expense category mapping (first match wins) ───────────────────────────────
# IMPORTANT: avoid generic English words (FOOD, SHOP, MARKET) — UPI narrations
# from ICICI/HDFC often append the merchant category as a suffix like "/Food"
# which would cause false matches across all transactions.

_CAT_RULES: list[tuple[re.Pattern, str]] = [
    # Food — specific delivery/restaurant brands only
    (re.compile(
        r'\b(SWIGGY|ZOMATO|EATSURE|FAASOS|BOX8|REBEL\s*FOODS|FRESHMENU|'
        r'DOMINOS|DOMINO|PIZZA\s*HUT|KFC|MCDONALDS|BURGER\s*KING|SUBWAY|'
        r'BARBEQUE\s*NATION|BIRYANI\s*BLUES|PARADISE\s*BIRYANI|HALDIRAMS|'
        r'CAFE\s*COFFEE\s*DAY|STARBUCKS|COSTA\s*COFFEE|BARISTA)\b', re.I),
        'Food'),

    # Groceries — delivery apps and supermarket chains
    (re.compile(
        r'\b(BIGBASKET|BLINKIT|INSTAMART|ZEPTO|GROFERS|JIOMART|'
        r'DMART\b|D\s*MART|RELIANCE\s*FRESH|RELIANCE\s*SMART|MORE\s*SUPERMARKET|'
        r'SPENCERS|NATURE\s*BASKET|STAR\s*BAZAAR|HYPERCITY|EASYDAY)\b', re.I),
        'Groceries'),

    # Shopping — e-commerce and retail brands
    (re.compile(
        r'\b(AMAZON(?!\s*PAY|\s*PRIME)|\bFLIPKART\b|MYNTRA|AJIO|NYKAA|MEESHO|'
        r'SNAPDEAL|TATACLIQ|SHOPSY|FIRSTCRY|LENSKART|PEPPERFRY|URBAN\s*LADDER|'
        r'CROMA\b|VIJAY\s*SALES|RELIANCE\s*DIGITAL|IMAGINE\b)\b', re.I),
        'Shopping'),

    # Travel — ride apps, transit, flights, hotels, booking
    (re.compile(
        r'\b(UBER(?!\s*EATS)|OLA\s*CABS|OLA\s*MONEY|RAPIDO|YULU|BOUNCE\b|'
        r'METRO\s*RAIL|BMTC|BEST\s*BUS|KSRTC|MSRTC|IRCTC|REDBUS|'
        r'MAKEMYTRIP|GOIBIBO|CLEARTRIP|YATRA\b|FASTAG|NETC\s*FASTag|TOLL\s*PLAZA|'
        r'OYO\b|OYO\s*ROOMS|TREEBO|FABHOTELS|BOOKING\.COM|AIRBNB|AGODA|EXPEDIA)\b', re.I),
        'Travel'),

    # Petrol — fuel stations
    (re.compile(
        r'\b(PETROL\s*PUMP|FUEL\s*STATION|IOCL|BPCL|HPCL|INDIAN\s*OIL|'
        r'HP\s*PETROL|SHELL\b|ESSAR\s*OIL|RELIANCE\s*PETROL)\b', re.I),
        'Petrol'),

    # Entertainment — streaming, cinema, subscriptions
    (re.compile(
        r'\b(NETFLIX|SPOTIFY|HOTSTAR|DISNEY\+?|ZEE5|SONYLIV|VOOT|MXPLAYER|'
        r'BOOKMYSHOW|PVR\s*CINEMA|INOX\b|CINEPOLIS|CARNIVAL\s*CINEMA|'
        r'AMAZON\s*PRIME|APPLE\s*TV|YOUTUBE\s*PREMIUM|GOOGLE\s*ONE|ICLOUD|'
        r'LINKEDIN\s*PREMIUM|ZOMATO\s*GOLD|SWIGGY\s*ONE|SUBSCRIPTION\s*RENEWAL)\b', re.I),
        'Entertainment'),

    # Mobile recharge
    (re.compile(
        r'\b(AIRTEL(?!\s*(?:PAYMENT|DTH|BROADBAND|FIBER))|JIO\s*RECHARGE|BSNL|'
        r'VI\s*RECHARGE|VODAFONE\s*IDEA)\b', re.I),
        'Mobile'),

    # Internet — broadband, DTH, fiber
    (re.compile(
        r'\b(JIO\s*FIBER|TATA\s*SKY|DISH\s*TV|D2H\b|AIRTEL\s*DTH|'
        r'AIRTEL\s*BROADBAND|HATHWAY|ACT\s*FIBERNET|EXCITEL|TIKONA|'
        r'BROADBAND\s*BILL)\b', re.I),
        'Internet'),

    # Electricity
    (re.compile(
        r'\b(BESCOM|BSES|TATA\s*POWER|MSEDCL|KSEB|TORRENT\s*POWER|'
        r'ADANI\s*ELECTRICITY|ELECTRICITY\s*BILL)\b', re.I),
        'Electricity'),

    # Water
    (re.compile(r'\b(WATER\s*BILL|BWSSB|MCGM\s*WATER|WATER\s*CHARGES)\b', re.I),
        'Water'),

    # Gas
    (re.compile(
        r'\b(INDANE\s*GAS|HP\s*GAS|BHARATGAS|MAHANAGAR\s*GAS|IGL\b|MGL\b|'
        r'PIPED\s*GAS|GAS\s*BILL)\b', re.I),
        'Gas'),

    # Medical — pharmacies, hospitals, diagnostics
    (re.compile(
        r'\b(APOLLO\s*PHARMACY|APOLLO\s*HOSPITALS|MEDPLUS|NETMEDS|'
        r'PHARMEASY|TATA\s*1MG|HEALTHKART|PRACTO|LYBRATE|'
        r'MANIPAL\s*HOSPITAL|FORTIS|MAX\s*HOSPITAL|NARAYANA\s*HEALTH|'
        r'THYROCARE|LAL\s*PATH|DR\s*LAL|SRL\s*DIAGNOSTICS)\b', re.I),
        'Medical'),

    # School Fees — education platforms and institutions
    (re.compile(
        r'\b(BYJUS|BYJU|UNACADEMY|COURSERA|UDEMY|VEDANTU|TOPPR|'
        r'WHITEHAT|GREAT\s*LEARNING|UPGRAD|SCHOOL\s*FEES|COLLEGE\s*FEES|'
        r'UNIVERSITY\s*FEES|TUITION\s*FEES)\b', re.I),
        'School Fees'),

    # Insurance premiums
    (re.compile(
        r'\b(LIC\s*PREMIUM|LIC\s*OF\s*INDIA|STAR\s*HEALTH|HDFC\s*ERGO|'
        r'BAJAJ\s*ALLIANZ|MAX\s*LIFE|ICICI\s*LOMBARD|ICICI\s*PRU|'
        r'SBI\s*LIFE|TATA\s*AIA|NEW\s*INDIA\s*ASSURANCE|'
        r'INSURANCE\s*PREMIUM|POLICY\s*PREMIUM)\b', re.I),
        'Insurance'),

    # Home & Maintenance — rent, society fees
    (re.compile(
        r'\b(HOUSE\s*RENT|HOME\s*RENT|RENTAL\s*PAYMENT|PG\s*RENT|'
        r'SOCIETY\s*MAINTENANCE|MAINTENANCE\s*CHARGES|FLAT\s*RENT)\b', re.I),
        'Home & Maintenance'),

    # Health & Fitness — gyms, wellness apps
    (re.compile(
        r'\b(NYKAA\s*BEAUTY|PURPLLE|MCAFFEINE|MAMAEARTH|LAKME\s*SALON|'
        r'NATURALS\s*SALON|JAWED\s*HABIB|ENRICH\s*SALON|GREEN\s*TRENDS|'
        r'CULT\s*FIT|CUREFIT|HEALTHIFYME)\b', re.I),
        'Health & Fitness'),

    # Investments — brokers, MF platforms (debits from savings for SIP etc.)
    (re.compile(
        r'\b(ZERODHA|GROWW|UPSTOX|ANGEL\s*BROKING|5PAISA|IIFL\s*SECURITIES|'
        r'MOTILAL\s*OSWAL|COIN\s*MF|PAYTM\s*MONEY|KUVERA|SCRIPBOX|'
        r'SIP\s*DEBIT|MUTUAL\s*FUND\s*SIP)\b', re.I),
        'Miscellaneous'),
]


def _suggest_category(description: str) -> str:
    for pat, cat in _CAT_RULES:
        if pat.search(description):
            return cat
    return 'Miscellaneous'


# ── transaction classification ────────────────────────────────────────────────

def _classify(description: str, is_debit: bool) -> dict:
    desc = description.upper()

    if _IGNORED_KW.search(desc):
        return {'type': 'ignored', 'category_name': None}

    if not is_debit:
        if _SALARY_KW.search(desc):
            return {'type': 'income', 'category_name': 'Salary'}
        if _INCOME_KW.search(desc):
            return {'type': 'income', 'category_name': 'Other Income'}
        if _TRANSFER_IN_KW.search(desc):
            return {'type': 'transfer_in', 'category_name': None}
        return {'type': 'income', 'category_name': 'Other Income'}

    # Debit classification — order matters: specific before generic
    if _ATM_KW.search(desc):
        return {'type': 'atm', 'category_name': None}
    if _CC_PAYMENT_KW.search(desc):
        # Credit card bill payment — not imported as expense (would double-count card spends)
        return {'type': 'cc_payment', 'category_name': None}
    if _LOAN_EMI_KW.search(desc):
        # Loan EMI — a real expense, imported with Loan EMI category
        return {'type': 'loan_emi', 'category_name': 'Loan EMI'}
    if _TRANSFER_OUT_KW.search(desc):
        return {'type': 'transfer_out', 'category_name': None}
    return {'type': 'expense', 'category_name': _suggest_category(description)}


# ── main entry ────────────────────────────────────────────────────────────────

def _xls_to_rows(content: bytes) -> list[list[str]]:
    """
    Read a legacy .xls file using xlrd 1.x directly (bypasses pandas version check).
    Returns a list of rows, each row being a list of string values.
    """
    import xlrd
    from datetime import timedelta as _td
    wb = xlrd.open_workbook(file_contents=content)
    ws = wb.sheet_by_index(0)
    result = []
    for r in range(ws.nrows):
        row_vals = []
        for c in range(ws.ncols):
            cell = ws.cell(r, c)
            if cell.ctype == xlrd.XL_CELL_DATE:
                # Convert Excel serial date to DD/MM/YYYY string
                dt = xlrd.xldate_as_datetime(cell.value, wb.datemode)
                row_vals.append(dt.strftime('%d/%m/%Y'))
            elif cell.ctype == xlrd.XL_CELL_NUMBER:
                v = cell.value
                row_vals.append(str(int(v)) if v == int(v) else str(v))
            elif cell.ctype == xlrd.XL_CELL_EMPTY:
                row_vals.append('')
            else:
                row_vals.append(str(cell.value).strip())
        result.append(row_vals)
    return result


def _xlsx_to_rows(content: bytes) -> list[list[str]]:
    """Read a .xlsx file using openpyxl (no xlrd needed)."""
    import io
    import pandas as pd
    df = pd.read_excel(io.BytesIO(content), header=None, engine='openpyxl', dtype=str)
    return [
        ['' if (str(v) in ('nan', 'NaT', 'None') or v is None) else str(v).strip()
         for v in row]
        for row in df.values.tolist()
    ]


def _rows_to_transactions(rows: list[list[str]]) -> tuple[Optional[str], list[dict]]:
    """
    Given a list of string rows (from XLS or XLSX), detect the header,
    map columns, and return (bank, raw_transaction_rows).
    """
    # Detect bank from first 20 rows
    bank = None
    early_text = ' '.join(' '.join(r) for r in rows[:20]).upper()
    for b in ['HDFC', 'ICICI', 'AXIS', 'KOTAK', 'YES BANK', 'SBI', 'STATE BANK',
              'INDUSIND', 'IDFC', 'FEDERAL', 'CANARA', 'UNION BANK', 'PNB', 'BOB']:
        if b in early_text:
            bank = b
            break

    # Find header row
    header_idx = None
    for i, row in enumerate(rows):
        row_str = ' '.join(row).lower()
        if any(kw in row_str for kw in ['withdrawal', 'deposit', 'narration', 'remarks',
                                         'transaction date', 'value date']):
            header_idx = i
            break

    if header_idx is None:
        raise ValueError(
            'Could not find the transaction table header. '
            'Expected columns like "Withdrawal Amount", "Deposit Amount", "Transaction Remarks".'
        )

    headers = [h.strip().lower() for h in rows[header_idx]]

    def find_col(*keywords: str) -> Optional[int]:
        for kw in keywords:
            for idx, h in enumerate(headers):
                if kw in h:
                    return idx
        return None

    date_idx = find_col('value date', 'transaction date', 'date')
    narr_idx = find_col('transaction remarks', 'narration', 'remarks', 'description', 'particulars')
    wdl_idx  = find_col('withdrawal')
    dep_idx  = find_col('deposit')

    if date_idx is None or narr_idx is None:
        raise ValueError(
            f'Could not identify date or narration columns. Found: {headers}'
        )

    raw_rows: list[dict] = []
    for row in rows[header_idx + 1:]:
        if not any(v.strip() for v in row):
            continue  # skip blank rows

        def cell(idx: Optional[int]) -> str:
            if idx is None or idx >= len(row):
                return ''
            return row[idx].strip()

        date_raw = cell(date_idx)
        if not date_raw or date_raw in ('-', 'nan'):
            continue

        txn_date = _parse_date(date_raw)
        if not txn_date:
            # Try Excel serial number
            try:
                from datetime import timedelta
                txn_date = date(1899, 12, 30) + timedelta(days=int(float(date_raw)))
            except Exception:
                continue

        narr = cell(narr_idx)
        if not narr or narr in ('-', 'nan'):
            continue

        def cell_amount(idx: Optional[int]) -> Optional[int]:
            v = cell(idx)
            if v in ('', '-', 'nan', '0', '0.0'):
                return None
            return _parse_amount(v)

        wdl = cell_amount(wdl_idx)
        dep = cell_amount(dep_idx)

        if wdl and not dep:
            amt_paise, is_debit = wdl, True
        elif dep and not wdl:
            amt_paise, is_debit = dep, False
        elif wdl and dep:
            is_debit  = not bool(_CR_NARR.search(narr))
            amt_paise = dep if not is_debit else wdl
        else:
            amounts = _AMT_PAT.findall(narr)
            if not amounts:
                continue
            amt_paise = _parse_amount(amounts[0])
            is_debit  = not bool(_CR_NARR.search(narr))

        if not amt_paise or amt_paise <= 0:
            continue

        clean_narr = re.sub(r'\s{2,}', ' ', narr).strip().rstrip('.,')
        raw_rows.append({
            'date':         txn_date.isoformat(),
            'description':  clean_narr,
            'amount_paise': amt_paise,
            'is_debit':     is_debit,
        })

    return bank, raw_rows


def _parse_excel_rows(content: bytes, filename: str) -> tuple[Optional[str], list[dict]]:
    """Route to the right reader based on file extension."""
    ext = filename.lower().rsplit('.', 1)[-1]
    try:
        if ext == 'xls':
            rows = _xls_to_rows(content)   # xlrd 1.x directly — no pandas
        else:
            rows = _xlsx_to_rows(content)  # openpyxl via pandas
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f'Cannot open Excel file: {e}')
    return _rows_to_transactions(rows)


def parse_bank_statement(content: bytes, filename: str, password: Optional[str] = None) -> dict:
    """
    Parse a bank statement (PDF, XLS, XLSX, or CSV/TXT).

    Returns:
      {
        bank_detected: str | None,
        total_rows:    int,
        transactions:  list[dict],
        summary:       dict[str, int],
      }
    """
    fname = filename.lower()
    is_pdf   = fname.endswith('.pdf') or (len(content) > 4 and content[:4] == b'%PDF')
    is_excel = fname.endswith('.xls') or fname.endswith('.xlsx')

    # ── Excel path ────────────────────────────────────────────────────────────
    if is_excel:
        bank, raw_rows = _parse_excel_rows(content, filename)
        transactions: list[dict] = []
        seen: set[tuple] = set()
        for row in raw_rows:
            if _IGNORED_KW.search(row['description'].upper()):
                continue
            key = (row['date'], row['amount_paise'], row['description'][:20])
            if key in seen:
                continue
            seen.add(key)
            clf = _classify(row['description'], row['is_debit'])
            if clf['type'] == 'ignored':
                continue
            transactions.append({**row, 'type': clf['type'], 'category_name': clf['category_name']})
        transactions.sort(key=lambda t: t['date'])
        summary: dict[str, int] = {k: 0 for k in ('expense', 'atm', 'loan_emi', 'cc_payment', 'transfer_out', 'transfer_in', 'income', 'ignored')}
        for t in transactions:
            summary[t['type']] = summary.get(t['type'], 0) + 1
        logger.info('Excel statement: bank=%s rows=%d summary=%s', bank, len(transactions), summary)
        return {'bank_detected': bank, 'total_rows': len(transactions), 'transactions': transactions, 'summary': summary}

    # ── PDF / text path ───────────────────────────────────────────────────────
    if is_pdf:
        try:
            lines = _lines_from_pdf(content, password)
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f'Cannot open PDF: {e}')
    else:
        for enc in ('utf-8-sig', 'utf-8', 'latin-1'):
            try:
                lines = [l.strip() for l in content.decode(enc).splitlines() if l.strip()]
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError('Cannot decode file — upload a PDF, XLS, XLSX, or CSV.')

    # ── detect bank and format ────────────────────────────────────────────────
    header_text = '\n'.join(lines[:40]).upper()

    bank = None
    for b in ['HDFC', 'ICICI', 'AXIS', 'KOTAK', 'YES BANK', 'SBI', 'STATE BANK',
              'INDUSIND', 'IDFC', 'FEDERAL', 'CANARA', 'UNION BANK', 'PNB', 'BOB']:
        if b in header_text:
            bank = b
            break

    # Detect tabular format by looking for the header row keywords
    is_tabular = bool(_TABULAR_HEADER.search(header_text))
    logger.info('Bank statement: bank=%s tabular=%s', bank, is_tabular)

    # ── extract transactions ──────────────────────────────────────────────────
    transactions: list[dict] = []
    seen: set[tuple] = set()

    for line in lines:
        row: Optional[dict] = None

        if is_tabular:
            m = _TABULAR_ROW.match(line)
            if m:
                row = _parse_tabular_row(m.group(1), m.group(2), m.group(3), m.group('rest'))

        if row is None:
            # Fall through to date-first format
            m2 = _DATE_FIRST_ROW.match(line)
            if m2:
                txn_date = _parse_date(m2.group('date'))
                if txn_date:
                    rest    = m2.group('rest')
                    amounts = _AMT_PAT.findall(rest)
                    if amounts:
                        amt_paise, is_debit = _detect_debit_date_first(rest, amounts)
                        if amt_paise and amt_paise > 0:
                            desc = re.sub(r'[\d,]+\.\d{2}\s*(?:Dr|Cr)?', '', rest, flags=re.I)
                            desc = re.sub(r'\s{2,}', ' ', desc).strip().rstrip('.,')
                            if len(desc) >= 2:
                                row = {
                                    'date':         txn_date.isoformat(),
                                    'description':  desc,
                                    'amount_paise': amt_paise,
                                    'is_debit':     is_debit,
                                }

        if row is None:
            continue

        # Dedup
        key = (row['date'], row['amount_paise'], row['description'][:20])
        if key in seen:
            continue
        seen.add(key)

        # Skip ignored / balance lines
        if _IGNORED_KW.search(row['description'].upper()):
            continue

        clf = _classify(row['description'], row['is_debit'])
        if clf['type'] == 'ignored':
            continue

        transactions.append({
            'date':          row['date'],
            'description':   row['description'],
            'amount_paise':  row['amount_paise'],
            'is_debit':      row['is_debit'],
            'type':          clf['type'],
            'category_name': clf['category_name'],
        })

    transactions.sort(key=lambda t: t['date'])

    summary: dict[str, int] = {k: 0 for k in ('expense', 'atm', 'loan_emi', 'cc_payment', 'transfer_out', 'transfer_in', 'income', 'ignored')}
    for t in transactions:
        summary[t['type']] = summary.get(t['type'], 0) + 1

    logger.info('Parsed: bank=%s rows=%d summary=%s', bank, len(transactions), summary)

    return {
        'bank_detected': bank,
        'total_rows':    len(transactions),
        'transactions':  transactions,
        'summary':       summary,
    }
