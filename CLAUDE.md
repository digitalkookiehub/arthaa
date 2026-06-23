# CLAUDE.md - ArthaA Project Rules

> Project-specific rules Claude follows in every conversation for this codebase.

---

## Project Overview

**Project Name:** ArthaA
**Description:** AI-Powered Personal Finance and Debt Management Web Application for Indian users
**Tech Stack:**
- Backend: FastAPI + Python 3.11+
- Frontend: React + Vite + TypeScript
- Database: PostgreSQL + SQLAlchemy
- Auth: JWT + bcrypt (Email/Password only)
- UI: Chakra UI + Framer Motion
- AI: Ollama + LangChain + LangGraph
- Analytics: Pandas + NumPy + Recharts
- Document OCR: PyMuPDF + Tesseract

---

## Project Structure

```
arthaa/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── account.py
│   │   │   ├── expense.py
│   │   │   ├── income.py
│   │   │   ├── budget.py
│   │   │   ├── credit_card.py
│   │   │   ├── loan.py
│   │   │   ├── investment.py
│   │   │   ├── asset.py
│   │   │   ├── goal.py
│   │   │   ├── insurance.py
│   │   │   ├── subscription.py
│   │   │   ├── notification.py
│   │   │   ├── document.py
│   │   │   └── audit.py
│   │   ├── schemas/
│   │   ├── routers/
│   │   ├── services/
│   │   ├── ai/
│   │   │   ├── agents/
│   │   │   ├── chains/
│   │   │   └── prompts/
│   │   └── auth/
│   ├── alembic/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── charts/
│   │   │   ├── forms/
│   │   │   └── shared/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   └── types/
│   └── package.json
├── .claude/
│   └── commands/
├── skills/
├── agents/
└── PRPs/
```

---

## Code Standards

### Python (Backend)
```python
# ALWAYS use type hints
def get_expense(db: Session, expense_id: int, user_id: int) -> Expense:
    pass

# ALWAYS use async endpoints
@router.get("/expenses/{id}")
async def get_expense(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> ExpenseResponse:
    pass

# ALWAYS use logging, never print()
import logging
logger = logging.getLogger(__name__)
logger.info("Expense created: %s", expense_id)
```

### TypeScript (Frontend)
```typescript
// ALWAYS define interfaces — NO any types
interface Expense {
  id: number;
  amount: number;
  category: string;
  date: string;
  description: string;
}

// ALWAYS handle loading and error states
const fetchExpenses = async (filters: ExpenseFilters): Promise<Expense[]> => {
  const response = await api.get('/expenses', { params: filters });
  return response.data;
};
```

---

## Forbidden Patterns

### Backend
- Never use `print()` — use `logging` module
- Never store passwords in plain text — always bcrypt
- Never hardcode secrets — use environment variables
- Never use `SELECT *` — specify columns via SQLAlchemy models
- Never skip input validation — use Pydantic schemas everywhere
- Never expose internal IDs or sensitive fields (account numbers) in API responses

### Frontend
- Never use `any` type — define proper interfaces
- Never leave `console.log` in production code
- Never skip error handling in async operations
- Never use inline styles — use Chakra UI props or theme tokens
- Never store JWT tokens in localStorage — use httpOnly cookies or memory

---

## Module-Specific Rules

### Expense Module
- Every expense must have: user_id, account_id, category_id, date, amount
- Amount is always stored in INR paise (integer) to avoid floating-point issues
- Tags are stored as a PostgreSQL array column
- Recurring expenses generate new records, not modify the template

### Loan Module
- outstanding_balance is always recalculated after any prepayment or rate change
- Interest calculations use compound interest with monthly compounding
- Repayment schedule entries are immutable once generated (create new on rate change)
- Always maintain InterestRateHistory on any rate change

### AI Module
- AI recommendations are cached per user for 24 hours (do not call Ollama on every request)
- All AI prompts must include user's actual financial data — no hallucinated numbers
- LangGraph agents run asynchronously via background tasks
- AI chatbot responses must cite which data they used

### Net Worth
- Net worth snapshot is taken automatically every midnight via a background job
- Formula: net_worth = sum(account.balance) + sum(investment.current_value) + sum(asset.current_value) - sum(loan.outstanding_balance)

### India-Specific
- All amounts displayed as INR with Indian number format: ₹1,23,456.78
- Fiscal year runs April to March (not January to December)
- Tax deduction limits follow Indian IT Act sections

---

## API Conventions

- All endpoints prefixed with `/api/v1/`
- Use plural nouns: `/expenses`, `/loans`, `/investments`
- Pagination via `?page=1&limit=20` on all list endpoints
- Date format: ISO 8601 (`YYYY-MM-DD`)
- All list responses return `{ data: [], total: int, page: int, limit: int }`
- HTTP status codes:
  - 200: Success
  - 201: Created
  - 400: Bad Request (validation error)
  - 401: Unauthorized (missing/invalid token)
  - 403: Forbidden (insufficient permissions)
  - 404: Not Found
  - 409: Conflict (duplicate)
  - 422: Unprocessable Entity (Pydantic validation)

---

## Authentication

### JWT Configuration
- Access token expires: 30 minutes
- Refresh token expires: 7 days
- Algorithm: HS256
- All protected endpoints use `Depends(get_current_user)`

### Role-Based Access
- Roles: `user` (default), `admin`
- Admin endpoints use `Depends(get_admin_user)`
- Users can only access their own financial data (always filter by `user_id`)

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/arthaa

# Auth
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# AI (Ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-r1:7b

# OCR
TESSERACT_CMD=/usr/bin/tesseract

# File Storage
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE_MB=10

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## Development Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# Ollama (AI)
ollama pull deepseek-r1:7b
ollama serve

# Docker (full stack)
docker-compose up -d

# Tests
pytest backend/tests -v --cov=app
cd frontend && npm test

# Linting
ruff check backend/ --fix
cd frontend && npm run lint && npm run type-check
```

---

## Validation Commands

```bash
ruff check backend/ && pytest
npm run lint && npm run type-check
docker-compose build
```

---

## Commit Message Format

```
feat(expense): add receipt OCR endpoint
fix(loan): correct compound interest calculation
refactor(ai): extract agent orchestration to service layer
test(budget): add variance calculation tests
docs: update API endpoint documentation
```

---

## Skills Reference

| Task | Skill to Read |
|------|---------------|
| Database models | skills/DATABASE.md |
| API + Auth | skills/BACKEND.md |
| React + UI | skills/FRONTEND.md |
| Testing | skills/TESTING.md |
| Docker + Deployment | skills/DEPLOYMENT.md |

---

## Agent Coordination

For complex tasks, the ORCHESTRATOR coordinates:
- DATABASE-AGENT → All SQLAlchemy models + Alembic migrations
- BACKEND-AGENT → FastAPI routers, services, AI integration
- FRONTEND-AGENT → React pages, Chakra UI components, charts
- DEVOPS-AGENT → Docker, Nginx, Ollama setup
- TEST-AGENT → Pytest + React Testing Library
- REVIEW-AGENT → Security audit, code quality

Read agent definitions in `/agents/` folder.

---

## Workflow

```
1. Edit INITIAL.md (product is already defined)
2. /generate-prp INITIAL.md
3. /execute-prp PRPs/arthaa-prp.md
```
