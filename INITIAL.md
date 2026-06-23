# INITIAL.md - ArthaA Product Definition

> AI-Powered Personal Finance and Debt Management Web Application for Indian users — helping them track income, expenses, loans, investments, and net worth while providing AI-driven recommendations for debt reduction and wealth creation.

---

## PRODUCT

### Name
ArthaA

### Description
ArthaA is a comprehensive personal finance platform built specifically for Indian users. It unifies expense tracking, income management, loan/debt analysis, investment monitoring, and AI-driven financial advice into a single dashboard. The AI layer (powered by local LLMs via Ollama) provides personalized budget suggestions, debt closure strategies, and wealth-building recommendations based on each user's complete financial picture.

### Target User
Indian individuals who struggle with personal finance — salaried employees, freelancers, and small business owners who want to take control of their money, reduce debt, and build wealth.

### Type
- [x] SaaS (Software as a Service)

---

## TECH STACK

### Backend
- [x] FastAPI + Python 3.11+
- [x] SQLAlchemy ORM
- [x] Pandas + NumPy (analytics)

### Frontend
- [x] React + Vite + TypeScript
- [x] Chakra UI (component library)
- [x] Framer Motion (animations)
- [x] Recharts (charts)

### Database
- [x] PostgreSQL

### Authentication
- [x] Email/Password (JWT + bcrypt)
- [x] JWT access tokens (30 min) + refresh tokens (7 days)

### AI Layer
- [x] Ollama (local LLM runtime)
- [x] LangChain + LangGraph (agent orchestration)
- [x] Supported models: DeepSeek, Gemma, Llama3

### Document Processing
- [x] PyMuPDF (PDF parsing)
- [x] Tesseract OCR (receipt/statement scanning)

### Deployment
- [x] Docker + Docker Compose
- [x] Nginx (reverse proxy)

### Payments
- [ ] No payments needed for initial launch

---

## MODULES

### Module 1: Authentication & User Management (Required)

**Description:** User registration, login, profile management, role-based access control.

**Models:**
- User: id, email, hashed_password, full_name, phone, date_of_birth, city, is_active, is_verified, role (user/admin), created_at, updated_at
- RefreshToken: id, user_id, token, expires_at, revoked
- Settings: id, user_id, currency (INR), language, notification_preferences, dark_mode

**API Endpoints:**
- POST /auth/register — Create new account
- POST /auth/login — Login with email/password
- POST /auth/refresh — Refresh access token
- POST /auth/logout — Revoke refresh token
- GET /auth/me — Get current user profile
- PUT /auth/me — Update profile
- POST /auth/change-password — Change password
- POST /auth/forgot-password — Request password reset
- POST /auth/reset-password — Reset password with token

**Frontend Pages:**
- /login — Login page
- /register — Registration page
- /forgot-password — Forgot password page
- /reset-password — Reset password page
- /profile — User profile & settings (protected)

---

### Module 2: Account Management

**Description:** Manage all financial accounts — bank accounts, cash, wallets, UPI.

**Models:**
- Account: id, user_id, name, account_type (bank/cash/wallet/upi), bank_name, account_number (masked), balance, is_active, created_at

**Supported Banks:** SBI, HDFC, ICICI, Axis, Kotak, Indian Bank, IOB, and other

**API Endpoints:**
- GET /accounts — List all accounts with balances
- POST /accounts — Add account
- PUT /accounts/{id} — Update account
- DELETE /accounts/{id} — Delete account
- GET /accounts/{id}/transactions — Account transaction history
- POST /accounts/{id}/sync-balance — Update balance

**Frontend Pages:**
- /accounts — Accounts list with balance summary
- /accounts/new — Add account form

---

### Module 3: Expense Tracker

**Description:** Log, categorize, and analyze daily expenses with receipt OCR and CSV/Excel import.

**Models:**
- ExpenseCategory: id, name, icon, color, is_system
- Expense: id, user_id, account_id, category_id, date, amount, description, subcategory, payment_method, location, tags[], is_recurring, recurring_interval, bill_attachment_url, created_at
- RecurringExpense: id, user_id, expense_template_id, next_due_date, is_active

**Built-in Categories:** Food, Milk, Groceries, Vegetables, Petrol, Medical, School Fees, Electricity, Water, Gas, Internet, Mobile, Entertainment, Insurance, EMIs, Travel, Shopping, Miscellaneous

**API Endpoints:**
- GET /expenses — List expenses (filters: date_range, category, account, amount_range)
- POST /expenses — Add expense
- PUT /expenses/{id} — Update expense
- DELETE /expenses/{id} — Delete expense
- GET /expenses/summary — Monthly/yearly summary by category
- POST /expenses/import — Import from CSV/Excel
- POST /expenses/ocr — Extract expense from receipt image

**Frontend Pages:**
- /expenses — Expense list with filters and search
- /expenses/new — Add expense form
- /expenses/recurring — Manage recurring expenses
- /expenses/import — Import expenses from file

---

### Module 4: Income Tracker

**Description:** Track all income sources and calculate savings rate.

**Models:**
- Income: id, user_id, account_id, source_type (salary/bonus/rental/interest/side_business/freelancing/dividend/other), amount, date, description, is_recurring, recurring_interval, created_at

**Metrics:** Monthly income total, savings rate, income growth (month over month), income by source breakdown

**API Endpoints:**
- GET /income — List income entries
- POST /income — Add income
- PUT /income/{id} — Update income
- DELETE /income/{id} — Delete income
- GET /income/summary — Monthly/yearly income summary

**Frontend Pages:**
- /income — Income list and summary
- /income/new — Add income form

---

### Module 5: Budget Planner

**Description:** Set monthly budgets per category and track spending against targets.

**Models:**
- Budget: id, user_id, month, year, category_id, budgeted_amount, created_at

**API Endpoints:**
- GET /budgets?month=&year= — Get budget plan for month
- POST /budgets — Create budget plan
- PUT /budgets/{id} — Update budget allocation
- GET /budgets/variance — Budget vs actual analysis

**Frontend Pages:**
- /budgets — Budget planner with category breakdown
- /budgets/new — Create monthly budget

---

### Module 6: Credit Card Tracker

**Description:** Track credit card usage, due dates, limits, rewards, and interest estimation.

**Models:**
- CreditCard: id, user_id, card_name, bank_name, last4_digits, credit_limit, outstanding_balance, due_date, minimum_due, interest_rate, rewards_points, is_active, created_at
- CreditCardTransaction: id, credit_card_id, amount, description, date, category_id

**API Endpoints:**
- GET /credit-cards — List all credit cards
- POST /credit-cards — Add credit card
- PUT /credit-cards/{id} — Update card details
- DELETE /credit-cards/{id} — Delete card
- GET /credit-cards/{id}/transactions — Card transactions
- GET /credit-cards/utilization — Utilization ratio summary

**Frontend Pages:**
- /credit-cards — Credit card overview with due dates and utilization
- /credit-cards/{id} — Card detail and transactions

---

### Module 7: Loan Management

**Description:** Track all loans including home, personal, gold, car, education loans.

**Models:**
- Loan: id, user_id, loan_type (home/personal/gold/car/education/credit_card), bank_name, loan_amount, outstanding_balance, interest_rate, emi_amount, start_date, tenure_months, remaining_tenure, account_id, created_at
- LoanPrepayment: id, loan_id, amount, date, type (lump_sum/emi_increase), interest_saved, tenure_reduced

**API Endpoints:**
- GET /loans — List all loans
- POST /loans — Add loan
- PUT /loans/{id} — Update loan details
- DELETE /loans/{id} — Delete loan
- GET /loans/{id}/schedule — Get repayment schedule
- POST /loans/{id}/prepayment — Simulate/record prepayment
- GET /loans/summary — Total outstanding, monthly EMI burden

**Frontend Pages:**
- /loans — Loan portfolio overview
- /loans/new — Add loan form
- /loans/{id} — Loan detail with repayment schedule

---

### Module 8: Repayment Schedule

**Description:** Generate or upload EMI schedules, extract data from PDF/Excel/CSV.

**Models:**
- RepaymentSchedule: id, loan_id, emi_number, principal, interest, outstanding_balance, due_date, paid, paid_date

**API Endpoints:**
- GET /loans/{id}/schedule — Full repayment schedule
- POST /loans/{id}/schedule/upload — Upload PDF/Excel/CSV schedule
- PUT /loans/{id}/schedule/{emi_no}/mark-paid — Mark EMI as paid
- POST /loans/{id}/schedule/generate — Auto-generate from loan parameters

---

### Module 9: Interest Rate Change Engine

**Description:** Update loan interest rates and auto-recalculate EMI and remaining tenure.

**Models:**
- InterestRateHistory: id, loan_id, old_rate, new_rate, effective_date, emi_impact, tenure_impact

**API Endpoints:**
- POST /loans/{id}/interest-rate — Update interest rate (triggers recalculation)
- GET /loans/{id}/interest-history — Rate change history

---

### Module 10: Prepayment Analysis

**Description:** Simulate loan prepayments to show interest saved and tenure reduction.

**API Endpoints:**
- POST /loans/{id}/prepayment/simulate — Simulate prepayment scenarios
  - Input: amount, type (lump_sum/emi_increase/tenure_reduce)
  - Output: interest_saved, years_saved, new_emi, new_tenure

---

### Module 11: Debt Closure Strategies

**Description:** AI-powered debt reduction plans using proven strategies.

**Strategies:** Debt Snowball, Debt Avalanche, Highest EMI First, Lowest Balance First, Custom

**API Endpoints:**
- GET /loans/debt-strategy — Get recommended debt closure plan
  - Output: ordered loan list, debt-free date, total interest saved, monthly payment plan

**Frontend Pages:**
- /loans/strategy — Debt closure strategy planner

---

### Module 12: Investment Tracker

**Description:** Track all investments including mutual funds, SIP, stocks, PPF, FD, NPS.

**Models:**
- Investment: id, user_id, investment_type (PPF/EPF/NPS/MutualFund/SIP/Stocks/FD/Gold/PostOffice/Other), name, invested_amount, current_value, returns_pct, start_date, maturity_date, notes, created_at

**API Endpoints:**
- GET /investments — List all investments
- POST /investments — Add investment
- PUT /investments/{id} — Update investment value
- DELETE /investments/{id} — Delete investment
- GET /investments/summary — Portfolio summary with allocation breakdown

**Frontend Pages:**
- /investments — Investment portfolio with allocation chart
- /investments/new — Add investment form

---

### Module 13: Asset & Liability Tracker

**Description:** Track physical assets (house, gold, vehicles) for net worth calculation.

**Models:**
- Asset: id, user_id, asset_type (house/land/gold/vehicle/cash/other), name, purchase_value, current_value, purchase_date, notes
- AssetValueHistory: id, asset_id, value, recorded_date

**API Endpoints:**
- GET /assets — List all assets
- POST /assets — Add asset
- PUT /assets/{id} — Update asset value
- DELETE /assets/{id} — Delete asset

---

### Module 14: Net Worth Dashboard

**Description:** Real-time net worth = assets - liabilities with historical trend charts.

**Models:**
- NetWorthHistory: id, user_id, total_assets, total_liabilities, net_worth, recorded_date

**API Endpoints:**
- GET /net-worth — Current net worth breakdown
- GET /net-worth/history — Historical trend (monthly/quarterly/yearly)
- POST /net-worth/snapshot — Create net worth snapshot

**Frontend Pages:**
- /net-worth — Net worth dashboard with trend charts

---

### Module 15: Goal Planner

**Description:** Set and track financial goals with progress visualization and AI suggestions.

**Models:**
- Goal: id, user_id, goal_type (emergency_fund/retirement/house/education/vacation/custom), name, target_amount, current_amount, target_date, monthly_contribution, priority, status (active/completed/paused), created_at

**API Endpoints:**
- GET /goals — List all goals
- POST /goals — Create goal
- PUT /goals/{id} — Update goal
- DELETE /goals/{id} — Delete goal
- POST /goals/{id}/contribute — Add contribution
- GET /goals/emergency-fund — Emergency fund calculator (3/6/12 months expenses)

**Frontend Pages:**
- /goals — Goal tracker with progress bars
- /goals/new — Create goal form

---

### Module 16: Financial Health Score

**Description:** Calculate a 0-100 score based on user's financial ratios.

**Score Components:** Savings ratio, Debt ratio (EMI burden), Emergency fund adequacy, Investment ratio, Insurance coverage, Credit utilization

**Rating Bands:** Poor (0-40), Average (41-60), Good (61-80), Excellent (81-100)

**API Endpoints:**
- GET /health-score — Current financial health score with component breakdown
- GET /health-score/history — Score history over time

**Frontend Pages:**
- /health-score — Health score gauge with improvement recommendations

---

### Module 17: What-If Simulator

**Description:** Scenario analysis for financial decisions.

**Scenarios:** Salary change impact, Loan prepayment impact, Interest rate change impact, Monthly investment growth, Retirement planning

**API Endpoints:**
- POST /simulator/salary-change — Simulate salary change impact
- POST /simulator/prepayment — Simulate loan prepayment
- POST /simulator/rate-change — Simulate interest rate change
- POST /simulator/investment — Simulate investment growth
- POST /simulator/retirement — Simulate retirement planning

**Frontend Pages:**
- /simulator — What-if scenario planner

---

### Module 18: Tax Planning (India)

**Description:** Indian tax planning with deduction tracking and old vs new regime comparison.

**Deductions:** 80C (PPF/ELSS/LIC/EPF), 80CCD (NPS), 80D (health insurance), HRA, Home loan interest (Section 24), Capital gains

**API Endpoints:**
- GET /tax/summary — Annual tax summary with deductions
- GET /tax/regime-comparison — Old vs New regime comparison
- GET /tax/suggestions — Tax saving recommendations

**Frontend Pages:**
- /tax — Tax planning dashboard

---

### Module 19: AI Financial Advisor

**Description:** Personalized AI recommendations powered by local LLMs via Ollama.

**AI Agents:**
- Expense Agent — spending pattern analysis, overspending alerts
- Loan Agent — debt reduction strategies, prepayment recommendations
- Investment Agent — portfolio allocation, SIP recommendations
- Tax Agent — tax-saving suggestions
- Budget Agent — budget optimization
- Goal Agent — goal achievement strategies
- Retirement Agent — retirement planning
- Coordinator Agent — orchestrates other agents

**API Endpoints:**
- GET /ai/recommendations — Get personalized recommendations
- POST /ai/analyze — Trigger full financial analysis
- GET /ai/alerts — Get overspending/financial health alerts

**Frontend Pages:**
- /ai-advisor — AI recommendations dashboard

---

### Module 20: AI Chatbot

**Description:** Natural language interface to query personal financial data.

**Example Queries:** "Where am I spending more this month?", "Which loan should I close first?", "Can I afford a car?", "When will I become debt-free?", "How much can I invest monthly?"

**API Endpoints:**
- POST /ai/chat — Send message, get response
- GET /ai/chat/history — Chat history

**Frontend Pages:**
- /chat — AI chatbot (also accessible as floating widget across all pages)

---

### Module 21: Document Management

**Description:** Upload and OCR financial documents — bank statements, loan papers, bills, insurance.

**Models:**
- Document: id, user_id, document_type (bank_statement/loan_statement/investment_statement/insurance/bill/other), file_name, file_url, ocr_status, extracted_data, uploaded_at

**API Endpoints:**
- GET /documents — List uploaded documents
- POST /documents/upload — Upload document (PDF/image)
- GET /documents/{id}/extracted — Get OCR extracted data
- DELETE /documents/{id} — Delete document

**Frontend Pages:**
- /documents — Document vault

---

### Module 22: Notifications & Calendar View

**Description:** Smart reminders for EMIs, SIPs, bills, credit card dues, insurance renewals.

**Models:**
- Notification: id, user_id, type, title, message, scheduled_date, is_read, channel (in_app/email)

**Calendar Events:** EMI due dates, SIP auto-debit dates, credit card due dates, bill payment dates, insurance renewal dates, goal contribution reminders

**API Endpoints:**
- GET /notifications — Get notifications
- PUT /notifications/{id}/read — Mark as read
- GET /calendar?month=&year= — Get calendar events for month

**Frontend Pages:**
- /calendar — Financial calendar view
- /notifications — Notification center

---

### Module 23: Reports

**Description:** Comprehensive financial reports with PDF/Excel/CSV export.

**Report Types:** Expense Report, Income Report, Cash Flow Report, Loan Report, Investment Report, Net Worth Report, Tax Report

**API Endpoints:**
- GET /reports/expense — Expense report
- GET /reports/income — Income report
- GET /reports/cash-flow — Cash flow report
- GET /reports/loan — Loan report
- GET /reports/net-worth — Net worth report
- GET /reports/tax — Tax report
- POST /reports/export — Export as PDF/Excel/CSV

**Frontend Pages:**
- /reports — Reports dashboard with export options

---

### Module 24: Insurance & Subscription Tracker

**Description:** Track insurance policies and recurring subscriptions to avoid missed renewals.

**Models:**
- Insurance: id, user_id, insurance_type (life/health/vehicle/other), provider, policy_number, premium_amount, renewal_date, coverage_amount, nominee, created_at
- Subscription: id, user_id, name, amount, billing_cycle (monthly/yearly), next_billing_date, category, is_active

**API Endpoints:**
- GET /insurance — List insurance policies
- POST /insurance — Add policy
- GET /subscriptions — List subscriptions
- POST /subscriptions — Add subscription

**Frontend Pages:**
- /insurance — Insurance tracker with renewal alerts
- /subscriptions — Subscription manager with monthly cost summary

---

### Module 25: Admin Panel

**Description:** Platform administration for user management and system monitoring.

**API Endpoints:**
- GET /admin/users — List all users
- PUT /admin/users/{id}/status — Enable/disable user
- GET /admin/stats — Platform statistics
- GET /admin/audit-logs — System audit trail

**Frontend Pages:**
- /admin — Admin dashboard (admin role only)
- /admin/users — User management

---

### Module 26: Main Dashboard

**Description:** Unified home screen showing all key financial metrics and AI insights.

**Widgets:** Net worth + trend, Monthly income vs expenses chart, Top spending categories (donut chart), Loan outstanding summary, Savings rate gauge, Financial health score, Upcoming EMIs and bills (next 7 days), Goal progress (top 3), AI recommendations teaser

**Frontend Pages:**
- /dashboard — Main dashboard (home after login)
- /settings — User preferences, dark mode, notification settings

---

## MVP SCOPE

### Must Have (MVP)
- [x] User registration and email/password login
- [x] Expense tracking with Indian categories (CRUD + monthly report)
- [x] Income tracking
- [x] Budget planner (monthly budgets vs actuals)
- [x] Basic loan management (add loans, view EMI schedule)
- [x] Net worth calculation (accounts + investments - loans)
- [x] Main dashboard with key metrics
- [x] AI financial advisor (basic recommendations via Ollama)
- [x] Document upload with OCR (receipts and bank statements)

### Nice to Have (Post-MVP)
- [ ] What-If Simulator
- [ ] Tax planning module
- [ ] Debt closure strategy planner
- [ ] Insurance & subscription tracker
- [ ] Calendar view
- [ ] PDF/Excel report export
- [ ] Credit card tracker with interest estimation
- [ ] Email/WhatsApp/Telegram notifications
- [ ] Family management / multi-user
- [ ] UPI SMS parsing
- [ ] Mobile app (PWA)
- [ ] Bank API integrations
- [ ] CIBIL score tracking

---

## ACCEPTANCE CRITERIA

### Authentication
- [ ] User can register with email and password
- [ ] User can login and receive JWT tokens
- [ ] Refresh token flow works correctly
- [ ] Protected routes redirect unauthenticated users to /login
- [ ] Password change flow works

### Expense Tracker
- [ ] User can add, edit, delete expenses with all fields
- [ ] Expenses filter by date range, category, amount
- [ ] CSV/Excel import correctly maps fields
- [ ] Receipt OCR extracts amount, date, merchant
- [ ] Monthly summary shows category breakdown

### Loan Management
- [ ] User can add loans with all fields
- [ ] Repayment schedule auto-generates from parameters
- [ ] Interest rate change recalculates EMI and tenure correctly
- [ ] Prepayment simulation shows correct interest savings

### AI Advisor
- [ ] AI generates personalized budget recommendations from user data
- [ ] Chatbot answers natural language financial queries
- [ ] Responses reference user's actual financial data

### Quality
- [ ] All API endpoints documented in Swagger/OpenAPI
- [ ] Backend test coverage 80%+
- [ ] Frontend TypeScript strict mode passes (no errors)
- [ ] Docker Compose builds and starts all services
- [ ] Responsive UI works on mobile and desktop
- [ ] Dark mode toggles correctly

---

## SPECIAL REQUIREMENTS

### Security
- [x] Rate limiting on auth endpoints (10 req/min)
- [x] Input validation on all endpoints (Pydantic)
- [x] SQL injection prevention (SQLAlchemy ORM)
- [x] XSS prevention
- [x] Passwords hashed with bcrypt
- [x] Sensitive data (account numbers) masked in API responses
- [x] Role-based access control (user/admin)
- [x] Audit trail for all financial data changes

### India-Specific
- [x] Currency display in INR with Indian number format (₹1,23,456)
- [x] Indian bank names as presets
- [x] Indian tax sections (80C, 80D, HRA, Section 24, etc.)
- [x] Indian investment types (PPF, EPF, NPS, ELSS, Post Office)
- [x] Indian expense categories (petrol, school fees, milk, etc.)

### Performance
- [x] Dashboard loads in < 2 seconds
- [x] OCR processing is async (non-blocking)
- [x] AI recommendations are cached (not recalculated on every request)

### Integrations
- [x] Ollama (local LLM — DeepSeek/Gemma/Llama3)
- [x] LangChain + LangGraph (AI agent orchestration)
- [x] Tesseract OCR + PyMuPDF (document processing)

---

## DATABASE TABLES

Users, Settings, Accounts, Expenses, ExpenseCategories, Income, Budgets, CreditCards, CreditCardTransactions, Loans, RepaymentSchedules, InterestRateHistory, LoanPrepayments, Investments, Assets, AssetValueHistory, Goals, Insurance, Subscriptions, Notifications, Documents, AIRecommendations, NetWorthHistory, FinancialHealthScore, AuditLogs

---

## AGENTS

> These agents will build ArthaA in parallel:

| Agent | Role | Works On |
|-------|------|----------|
| DATABASE-AGENT | Creates all models and migrations | All 25+ database tables |
| BACKEND-AGENT | Builds API endpoints and services | All 26 modules' backends |
| FRONTEND-AGENT | Creates UI pages and components | All module frontends |
| DEVOPS-AGENT | Sets up Docker, Nginx, Ollama | Infrastructure |
| TEST-AGENT | Writes unit and integration tests | All code |
| REVIEW-AGENT | Security and code quality audit | All code |

---

# READY?

```bash
/generate-prp INITIAL.md
```

Then:

```bash
/execute-prp PRPs/arthaa-prp.md
```
