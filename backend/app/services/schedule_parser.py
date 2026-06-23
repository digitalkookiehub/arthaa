"""
Parse bank-provided repayment schedule files (Excel / CSV).
Handles ICICI, HDFC, SBI, Axis and generic formats.
Returns list of dicts ready for import_schedule_from_data().
"""
import io
import re
import logging
from datetime import date, datetime

logger = logging.getLogger(__name__)


def _normalize(h: str) -> str:
    """Lowercase, strip, and remove parenthetical suffixes like (INR), (Rs.), (%)."""
    h = re.sub(r'\s*\(.*?\)', '', str(h)).lower().strip()
    # collapse multiple spaces
    return re.sub(r'\s+', ' ', h)


# Candidate normalized header names for each logical column
_EMI_NUM_KEYS = {
    "emi no", "emi no.", "emi number", "installment no", "installment no.",
    "installment number", "#", "sr no", "sr.", "month", "no.", "sl no", "sl.",
}
_DUE_DATE_KEYS = {
    "due date", "date", "payment date", "emi date", "instalment date",
    "installment date", "repayment date", "schedule date", "transaction date",
    "value date",
}
_PRINCIPAL_KEYS = {
    "principal", "principal component", "principal amount",
    "principal paid", "principal repaid",
}
_INTEREST_KEYS = {
    "interest", "interest component", "interest amount",
    "interest paid", "interest charged",
}
_BALANCE_KEYS = {
    "balance", "outstanding balance", "closing balance",
    "closing liability amount", "outstanding loan balance",
    "outstanding", "loan outstanding", "remaining balance",
    "principal outstanding",
}
_OPENING_KEYS = {
    "opening balance", "opening liability amount", "opening outstanding",
}
_EMI_AMT_KEYS = {
    "emi", "emi amount", "total emi", "instalment amount",
    "installment amount", "monthly emi", "total payment", "emi paid",
}


def _match_col(norm_headers: list[str], candidates: set[str]) -> int | None:
    for i, h in enumerate(norm_headers):
        if h in candidates:
            return i
    return None


def _parse_date(raw) -> date | None:
    # pandas may give us a datetime/Timestamp already
    if hasattr(raw, 'date') and callable(raw.date):
        return raw.date()
    if isinstance(raw, date):
        return raw

    s = str(raw).strip()
    if s in ("", "nan", "NaT", "None"):
        return None

    # Remove ordinal suffixes: "05th Nov 2025" → "05 Nov 2025"
    s = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', s)

    for fmt in (
        "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d-%b-%Y",
        "%d/%m/%y", "%d-%m-%y",
        "%Y-%m-%d", "%Y/%m/%d",
        "%b %d, %Y", "%B %d, %Y",
        "%d %B %Y",
        "%Y-%m-%d %H:%M:%S",  # pandas datetime string
    ):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _to_paise(raw) -> int:
    """Convert any currency string or float to paise integer."""
    s = str(raw).replace(",", "").replace("₹", "").replace("Rs.", "").replace("INR", "").strip()
    try:
        return round(float(s) * 100)
    except (ValueError, TypeError):
        return 0


_XLSX_MAGIC = b'PK\x03\x04'           # ZIP-based: xlsx, xlsm
_XLS_MAGIC  = b'\xd0\xcf\x11\xe0'    # OLE2 compound doc: xls


def _read_dataframe(content: bytes, filename: str):
    """
    Try every known strategy to load the file into a pandas DataFrame.
    Returns the first DataFrame that loads successfully.
    Raises ValueError with a user-friendly message on total failure.
    """
    import pandas as pd

    fname = filename.lower().split("?")[0]
    errors: list[str] = []

    # ── Strategy 0: PDF (PyMuPDF) ────────────────────────────────────────────
    is_pdf = fname.endswith(".pdf") or b'%PDF' in content[:1024]
    if is_pdf:
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=content, filetype="pdf")
            all_rows: list[list[str]] = []

            for page in doc:
                # Attempt 1: built-in table finder (works when borders exist)
                try:
                    finder = page.find_tables()
                    for table in finder.tables:
                        for row in table.extract():
                            clean = [str(c).strip() if c is not None else "" for c in row]
                            if any(c for c in clean):
                                all_rows.append(clean)
                except Exception:
                    pass

                if not all_rows:
                    # Attempt 2: word-position clustering (ICICI/borderless tables)
                    # get_text("words") → (x0,y0,x1,y1,word,block,line,wnum)
                    words = page.get_text("words")
                    if words:
                        # Group words by y-position (5-point snap grid)
                        from collections import defaultdict
                        rows_by_y: dict = defaultdict(list)
                        for x0, y0, x1, y1, word, *_ in words:
                            y_key = round(float(y0) / 5) * 5
                            rows_by_y[y_key].append((float(x0), str(word)))

                        for y_key in sorted(rows_by_y):
                            row_words = sorted(rows_by_y[y_key], key=lambda w: w[0])
                            # Cluster words into cells by horizontal gap (>12pt = new cell)
                            cells: list[str] = []
                            cell_buf = ""
                            prev_x1 = None
                            for x0, word in row_words:
                                if prev_x1 is not None and (x0 - prev_x1) > 12:
                                    cells.append(cell_buf.strip())
                                    cell_buf = word
                                else:
                                    cell_buf = (cell_buf + " " + word).strip()
                                # approximate x1 from word length (avg 6pt per char)
                                prev_x1 = x0 + len(word) * 6
                            if cell_buf.strip():
                                cells.append(cell_buf.strip())
                            if cells:
                                all_rows.append(cells)

            if all_rows:
                max_cols = max(len(r) for r in all_rows)
                for r in all_rows:
                    r.extend([""] * (max_cols - len(r)))
                return pd.DataFrame(all_rows)
            errors.append("pdf: no content extracted (empty document?)")
        except ImportError:
            errors.append("pdf: PyMuPDF not installed — run: pip install PyMuPDF")
        except Exception as e:
            errors.append(f"pdf: {e}")

    # ── Strategy 1: xlsx / xlsm ──────────────────────────────────────────────
    is_xlsx_ext = fname.endswith((".xlsx", ".xlsm"))
    is_xlsx_magic = content[:4] == _XLSX_MAGIC
    if is_xlsx_ext or is_xlsx_magic:
        try:
            return pd.read_excel(io.BytesIO(content), header=None, engine="openpyxl", dtype=str)
        except Exception as e:
            errors.append(f"openpyxl: {e}")

    # ── Strategy 2: binary xls (OLE2 / xlrd) ────────────────────────────────
    is_xls_ext   = fname.endswith(".xls")
    is_xls_magic = content[:4] == _XLS_MAGIC
    if is_xls_ext or is_xls_magic or (not is_xlsx_ext and not is_xlsx_magic):
        try:
            return pd.read_excel(io.BytesIO(content), header=None, engine="xlrd", dtype=str)
        except Exception as e:
            errors.append(f"xlrd: {e}")

    # ── Strategy 3: HTML table with .xls extension (common in Indian banks) ──
    snippet = content[:2048].lower()
    if b"<html" in snippet or b"<table" in snippet or b"<tr" in snippet:
        try:
            tables = pd.read_html(io.BytesIO(content), flavor="lxml", dtype=str)
            if tables:
                t = tables[0]
                return t.map(str) if hasattr(t, "map") else t.applymap(str)
        except Exception as e:
            errors.append(f"html-table: {e}")
        try:
            tables = pd.read_html(io.BytesIO(content), flavor="html5lib", dtype=str)
            if tables:
                t = tables[0]
                return t.map(str) if hasattr(t, "map") else t.applymap(str)
        except Exception as e:
            errors.append(f"html5lib: {e}")

    # ── Strategy 4: CSV / TSV with multiple separators and encodings ─────────
    for sep in (",", "\t", ";", "|"):
        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                df = pd.read_csv(
                    io.BytesIO(content), header=None, dtype=str,
                    encoding=enc, sep=sep, on_bad_lines="skip",
                )
                if df.shape[1] >= 3:   # need at least 3 columns to be useful
                    return df
            except UnicodeDecodeError:
                continue
            except Exception as e:
                errors.append(f"csv/{sep}/{enc}: {e}")
                break

    # ── Strategy 5: xlsx fallback even for .xls extension ───────────────────
    if not is_xlsx_magic:
        try:
            return pd.read_excel(io.BytesIO(content), header=None, engine="openpyxl", dtype=str)
        except Exception as e:
            errors.append(f"openpyxl-fallback: {e}")

    raise ValueError(
        "Cannot read this file. Supported formats: PDF, Excel (.xlsx, .xls), CSV. "
        "If your bank gave you a .xls file that won't upload, open it in Excel and "
        "save as .xlsx, then try again. "
        f"(Details: {'; '.join(errors[-3:])})"
    )


def parse_schedule_file(content: bytes, filename: str) -> list[dict]:
    """
    Parse uploaded file into schedule row dicts.
    Each dict: {emi_number, due_date, principal, interest, outstanding_balance, paid}
    Raises ValueError with a helpful message on failure.
    """
    try:
        import pandas as pd  # noqa: F401 — verify installed
    except ImportError:
        raise ValueError("pandas is required for file parsing. Run: pip install pandas")

    try:
        df = _read_dataframe(content, filename)
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Cannot read file: {e}")

    # Build the full candidate key set for header-row detection
    all_keys = (
        _EMI_NUM_KEYS | _DUE_DATE_KEYS | _PRINCIPAL_KEYS |
        _INTEREST_KEYS | _BALANCE_KEYS | _OPENING_KEYS | _EMI_AMT_KEYS
    )

    # Find the row that best matches known column headers
    header_row_idx = 0
    best_score = 0
    for idx, row in df.iterrows():
        score = sum(1 for cell in row if _normalize(str(cell)) in all_keys)
        if score > best_score:
            best_score = score
            header_row_idx = int(str(idx))
        if score >= 3:
            break

    raw_headers = [str(c) for c in df.iloc[header_row_idx].tolist()]
    norm_headers = [_normalize(h) for h in raw_headers]
    data_rows = df.iloc[header_row_idx + 1:].reset_index(drop=True)

    logger.debug("Detected headers: %s", norm_headers)

    emi_col     = _match_col(norm_headers, _EMI_NUM_KEYS)
    date_col    = _match_col(norm_headers, _DUE_DATE_KEYS)
    prin_col    = _match_col(norm_headers, _PRINCIPAL_KEYS)
    int_col     = _match_col(norm_headers, _INTEREST_KEYS)
    bal_col     = _match_col(norm_headers, _BALANCE_KEYS)
    opening_col = _match_col(norm_headers, _OPENING_KEYS)
    emi_amt_col = _match_col(norm_headers, _EMI_AMT_KEYS)

    if date_col is None:
        found = ", ".join(f'"{h}"' for h in raw_headers if h.strip())
        raise ValueError(
            f"Could not find a date column. Columns found in your file: {found}. "
            f"Expected a column named like: 'Due Date', 'Date', 'Installment Date', or 'Payment Date'."
        )

    if bal_col is None and prin_col is None and opening_col is None:
        raise ValueError("Could not find principal or balance columns in the file.")

    today = date.today()
    rows: list[dict] = []
    emi_counter = 1

    for _, row in data_rows.iterrows():
        cells = row.tolist()

        # Skip completely empty or title/summary rows
        non_empty = [str(c) for c in cells if str(c).strip() not in ("", "nan", "NaN", "None")]
        if len(non_empty) < 2:
            continue

        # Parse date first — skip row if no valid date
        raw_date = cells[date_col]
        due = _parse_date(raw_date)
        if due is None:
            continue

        # EMI number
        emi_number = emi_counter
        if emi_col is not None:
            try:
                emi_number = int(float(str(cells[emi_col]).replace(",", "").strip()))
            except (ValueError, TypeError):
                pass

        principal = _to_paise(cells[prin_col]) if prin_col is not None else 0
        interest  = _to_paise(cells[int_col])  if int_col is not None else 0

        # Closing balance takes priority; fall back to opening − principal
        if bal_col is not None:
            balance = _to_paise(cells[bal_col])
        elif opening_col is not None and prin_col is not None:
            balance = max(0, _to_paise(cells[opening_col]) - principal)
        else:
            balance = 0

        # If principal/interest are missing but EMI total is available, store as principal
        if principal == 0 and interest == 0 and emi_amt_col is not None:
            principal = _to_paise(cells[emi_amt_col])

        paid = due < today

        rows.append({
            "emi_number": emi_number,
            "due_date": due,
            "principal": principal,
            "interest": interest,
            "outstanding_balance": balance,
            "paid": paid,
        })
        emi_counter += 1

    if not rows:
        raise ValueError(
            "No valid EMI rows found. "
            "Make sure the file contains rows with a date and at least one amount column."
        )

    logger.info("Parsed %d schedule rows from '%s'", len(rows), filename)
    return rows
