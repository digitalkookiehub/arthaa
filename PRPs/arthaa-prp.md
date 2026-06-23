# PRP: ArthaA

> Implementation blueprint for parallel agent execution

---

## METADATA

| Field | Value |
|-------|-------|
| **Product** | ArthaA |
| **Type** | SaaS — Personal Finance Platform |
| **Version** | 1.0 |
| **Created** | 2026-06-22 |
| **Complexity** | High |
| **Target Market** | Indian individuals struggling with personal finance |

---

## PRODUCT OVERVIEW

**Description:** AI-Powered Personal Finance and Debt Management Web Application built specifically for Indian users. Unifies expense tracking, income management, loan/debt analysis, investment monitoring, and AI-driven financial advice into a single dashboard.

**Value Proposition:** The only personal finance app that combines Indian-specific financial instruments (PPF, NPS, ELSS, Section 80C), local LLM-powered AI advice (runs offline via Ollama), and end-to-end debt management with prepayment/closure strategy tools.

**MVP Scope:**
- [x] User registration and email/password login
- [x] Expense tracking with Indian categories (CRUD + monthly report + OCR)
- [x] Income tracking (multiple sources + savings rate)
- [x] Budget planner (monthly budgets vs actuals)
- [x] Basic loan management (add loans, EMI schedule generation)
- [x] Net worth calculation (accounts + investments - loans)
- [x] Main dashboard with all key financial metrics
- [x] AI financial advisor (basic recommendations via Ollama/LangChain)
- [x] Document upload with OCR (receipts + bank statements)

---

## TECH STACK

| Layer | Technology | Skill Reference |
|-------|------------|-----------------|
| Backend | FastAPI + Python 3.11+ | skills/BACKEND.md |
| Frontend | React + TypeScript + Vite | skills/FRONTEND.md |
| Database | PostgreSQL + SQLAlchemy | skills/DATABASE.md |
| Auth | JWT + bcrypt (Email/Password) | skills/BACKEND.md |
| UI | Chakra UI + Framer Motion | skills/FRONTEND.md |
| Charts | Recharts | skills/FRONTEND.md |
| AI | Ollama + LangChain + LangGraph | skills/BACKEND.md |
| OCR | PyMuPDF + Tesseract | skills/BACKEND.md |
| Analytics | Pandas + NumPy | skills/BACKEND.md |
| Testing | pytest + React Testing Library | skills/TESTING.md |
| Deployment | Docker + Docker Compose + Nginx | skills/DEPLOYMENT.md |

---

## DATABASE MODELS

### User Model
```
User:
  id: int (PK)
  email: str (unique, indexed)
  hashed_password: str
  full_name: str
  phone: str (nullable)
  date_of_birth: date (nullable)
  city: str (nullable)
  is_active: bool (default True)
  is_verified: bool (default False)
  role: enum (user, admin) (default user)
  created_at: datetime
  updated_at: datetime

RefreshToken:
  id: int (PK)
  user_id: int (FK → User)
  token: str (unique, indexed)
  expires_at: datetime
  revoked: bool (default False)

Settings:
  id: int (PK)
  user_id: int (FK → User, unique)
  currency: str (default INR)
  language: str (default en)
  dark_mode: bool (default False)
  email_notifications: bool (default True)
  fiscal_year_start_month: int (default 4 — April, Indian FY)
```

### Account Models
```
Account:
  id: int (PK)
  user_id: int (FK → User, indexed)
  name: str
  account_type: enum (bank, cash, wallet, upi)
  bank_name: str (nullable)
  account_number_masked: str (nullable)
  balance: int (INR paise, default 0)
  is_active: bool (default True)
  created_at: datetime
  updated_at: datetime
```

### Expense Models
```
ExpenseCategory:
  id: int (PK)
  name: str (unique)
  icon: str
  color: str (hex)
  is_system: bool (True for built-in Indian categories)

Expense:
  id: int (PK)
  user_id: int (FK → User, indexed)
  account_id: int (FK → Account, indexed)
  category_id: int (FK → ExpenseCategory)
  date: date (indexed)
  amount: int (INR paise)
  description: str
  subcategory: str (nullable)
  payment_method: enum (cash, upi, card, net_banking, cheque)
  location: str (nullable)
  tags: ARRAY[str]
  is_recurring: bool (default False)
  recurring_interval: enum (daily, weekly, monthly, yearly, nullable)
  bill_attachment_url: str (nullable)
  created_at: datetime

RecurringExpense:
  id: int (PK)
  user_id: int (FK → User)
  expense_template_id: int (FK → Expense)
  next_due_date: date
  is_active: bool (default True)
```

### Income Models
```
Income:
  id: int (PK)
  user_id: int (FK → User, indexed)
  account_id: int (FK → Account, indexed)
  source_type: enum (salary, bonus, rental, interest, side_business, freelancing, dividend, other)
  amount: int (INR paise)
  date: date (indexed)
  description: str (nullable)
  is_recurring: bool (default False)
  recurring_interval: enum (monthly, quarterly, yearly, nullable)
  created_at: datetime
```

### Budget Models
```
Budget:
  id: int (PK)
  user_id: int (FK → User, indexed)
  month: int (1-12)
  year: int
  category_id: int (FK → ExpenseCategory)
  budgeted_amount: int (INR paise)
  created_at: datetime
  UNIQUE: (user_id, month, year, category_id)
```

### Credit Card Models
```
CreditCard:
  id: int (PK)
  user_id: int (FK → User, indexed)
  card_name: str
  bank_name: str
  last4_digits: str(4)
  credit_limit: int (INR paise)
  outstanding_balance: int (INR paise)
  due_date: int (day of month, 1-31)
  minimum_due: int (INR paise)
  interest_rate: float (annual %)
  rewards_points: int (default 0)
  is_active: bool (default True)
  created_at: datetime

CreditCardTransaction:
  id: int (PK)
  credit_card_id: int (FK → CreditCard, indexed)
  amount: int (INR paise)
  description: str
  date: date
  category_id: int (FK → ExpenseCategory, nullable)
```

### Loan Models
```
Loan:
  id: int (PK)
  user_id: int (FK → User, indexed)
  loan_type: enum (home, personal, gold, car, education, credit_card, other)
  bank_name: str
  loan_amount: int (INR paise — original)
  outstanding_balance: int (INR paise — current)
  interest_rate: float (annual %)
  emi_amount: int (INR paise)
  start_date: date
  tenure_months: int
  remaining_tenure: int
  account_id: int (FK → Account, nullable — linked debit account)
  created_at: datetime

RepaymentSchedule:
  id: int (PK)
  loan_id: int (FK → Loan, indexed)
  emi_number: int
  principal: int (INR paise)
  interest: int (INR paise)
  outstanding_balance: int (INR paise)
  due_date: date
  paid: bool (default False)
  paid_date: date (nullable)

InterestRateHistory:
  id: int (PK)
  loan_id: int (FK → Loan, indexed)
  old_rate: float
  new_rate: float
  effective_date: date
  emi_impact: int (INR paise — change in EMI)
  tenure_impact: int (months — change in tenure)
  created_at: datetime

LoanPrepayment:
  id: int (PK)
  loan_id: int (FK → Loan, indexed)
  amount: int (INR paise)
  date: date
  prepayment_type: enum (lump_sum, emi_increase, tenure_reduce)
  interest_saved: int (INR paise — calculated)
  tenure_reduced: int (months — calculated)
  created_at: datetime
```

### Investment Models
```
Investment:
  id: int (PK)
  user_id: int (FK → User, indexed)
  investment_type: enum (PPF, EPF, NPS, MutualFund, SIP, Stocks, FD, Gold, PostOffice, Other)
  name: str
  invested_amount: int (INR paise)
  current_value: int (INR paise)
  returns_pct: float (nullable)
  start_date: date (nullable)
  maturity_date: date (nullable)
  notes: str (nullable)
  created_at: datetime
  updated_at: datetime
```

### Asset Models
```
Asset:
  id: int (PK)
  user_id: int (FK → User, indexed)
  asset_type: enum (house, land, gold, vehicle, cash, other)
  name: str
  purchase_value: int (INR paise)
  current_value: int (INR paise)
  purchase_date: date (nullable)
  notes: str (nullable)
  created_at: datetime

AssetValueHistory:
  id: int (PK)
  asset_id: int (FK → Asset, indexed)
  value: int (INR paise)
  recorded_date: date
```

### Goal Models
```
Goal:
  id: int (PK)
  user_id: int (FK → User, indexed)
  goal_type: enum (emergency_fund, retirement, house, education, vacation, custom)
  name: str
  target_amount: int (INR paise)
  current_amount: int (INR paise, default 0)
  target_date: date (nullable)
  monthly_contribution: int (INR paise, nullable)
  priority: int (1-5)
  status: enum (active, completed, paused)
  created_at: datetime
```

### Supporting Models
```
Insurance:
  id: int (PK)
  user_id: int (FK → User, indexed)
  insurance_type: enum (life, health, vehicle, other)
  provider: str
  policy_number: str
  premium_amount: int (INR paise)
  premium_frequency: enum (monthly, quarterly, yearly)
  renewal_date: date
  coverage_amount: int (INR paise)
  nominee: str (nullable)
  created_at: datetime

Subscription:
  id: int (PK)
  user_id: int (FK → User, indexed)
  name: str
  amount: int (INR paise)
  billing_cycle: enum (monthly, quarterly, yearly)
  next_billing_date: date
  category: str (nullable)
  is_active: bool (default True)
  created_at: datetime

Notification:
  id: int (PK)
  user_id: int (FK → User, indexed)
  notification_type: str
  title: str
  message: str
  scheduled_date: date (nullable)
  is_read: bool (default False)
  created_at: datetime

Document:
  id: int (PK)
  user_id: int (FK → User, indexed)
  document_type: enum (bank_statement, loan_statement, investment_statement, insurance, bill, receipt, other)
  file_name: str
  file_url: str
  file_size_kb: int
  ocr_status: enum (pending, processing, completed, failed)
  extracted_data: JSON (nullable)
  uploaded_at: datetime

AIRecommendation:
  id: int (PK)
  user_id: int (FK → User, indexed)
  recommendation_type: str (budget/debt/investment/tax/goal)
  title: str
  content: JSON
  ai_model: str (deepseek/gemma/llama3)
  created_at: datetime
  expires_at: datetime (24h TTL)

NetWorthHistory:
  id: int (PK)
  user_id: int (FK → User, indexed)
  total_assets: int (INR paise)
  total_liabilities: int (INR paise)
  net_worth: int (INR paise)
  recorded_date: date
  UNIQUE: (user_id, recorded_date)

FinancialHealthScore:
  id: int (PK)
  user_id: int (FK → User, indexed)
  score: int (0-100)
  savings_ratio_score: int
  debt_ratio_score: int
  emergency_fund_score: int
  investment_ratio_score: int
  insurance_score: int
  credit_utilization_score: int
  rating: enum (poor, average, good, excellent)
  recorded_date: date
  UNIQUE: (user_id, recorded_date)

AuditLog:
  id: int (PK)
  user_id: int (FK → User, indexed)
  table_name: str
  record_id: int
  action: enum (create, update, delete)
  old_data: JSON (nullable)
  new_data: JSON (nullable)
  created_at: datetime
```

---

## MODULES

### Module 1: Authentication & User Management
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /api/v1/auth/register | Create account | No |
| POST | /api/v1/auth/login | Login, get tokens | No |
| POST | /api/v1/auth/refresh | Refresh access token | No (refresh token) |
| POST | /api/v1/auth/logout | Revoke refresh token | Yes |
| GET | /api/v1/auth/me | Get current user profile | Yes |
| PUT | /api/v1/auth/me | Update profile | Yes |
| POST | /api/v1/auth/change-password | Change password | Yes |
| POST | /api/v1/auth/forgot-password | Request password reset email | No |
| POST | /api/v1/auth/reset-password | Reset with token | No |
| GET | /api/v1/auth/settings | Get user settings | Yes |
| PUT | /api/v1/auth/settings | Update settings | Yes |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /login | LoginPage | LoginForm, PasswordInput |
| /register | RegisterPage | RegisterForm, PasswordStrength |
| /forgot-password | ForgotPasswordPage | EmailForm |
| /reset-password | ResetPasswordPage | NewPasswordForm |
| /profile | ProfilePage | ProfileForm, AvatarUpload |
| /settings | SettingsPage | NotificationToggles, DarkModeSwitch |

---

### Module 2: Account Management
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/accounts | List all accounts with balance totals |
| POST | /api/v1/accounts | Add account |
| GET | /api/v1/accounts/{id} | Get account details |
| PUT | /api/v1/accounts/{id} | Update account |
| DELETE | /api/v1/accounts/{id} | Delete account |
| PUT | /api/v1/accounts/{id}/balance | Update account balance |
| GET | /api/v1/accounts/summary | Total balance across all accounts |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /accounts | AccountsPage | AccountCard, AddAccountModal |
| — | — | AccountBalanceSummary, BankIcon |

---

### Module 3: Expense Tracker
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/expenses | List expenses (filters: date_from, date_to, category_id, account_id, min_amount, max_amount, search) |
| POST | /api/v1/expenses | Add expense |
| GET | /api/v1/expenses/{id} | Get expense |
| PUT | /api/v1/expenses/{id} | Update expense |
| DELETE | /api/v1/expenses/{id} | Delete expense |
| GET | /api/v1/expenses/summary | Monthly/yearly summary by category |
| GET | /api/v1/expenses/categories | List expense categories |
| POST | /api/v1/expenses/import | Import from CSV/Excel (async) |
| POST | /api/v1/expenses/ocr | Extract expense from uploaded receipt |
| GET | /api/v1/expenses/recurring | List recurring expense templates |
| POST | /api/v1/expenses/recurring | Create recurring expense |
| PUT | /api/v1/expenses/recurring/{id} | Update recurring expense |
| DELETE | /api/v1/expenses/recurring/{id} | Delete recurring expense |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /expenses | ExpensesPage | ExpenseList, ExpenseFilters, ExpenseSummaryChart |
| /expenses/new | AddExpensePage | ExpenseForm, CategoryPicker, AccountPicker |
| /expenses/recurring | RecurringExpensesPage | RecurringExpenseList |
| /expenses/import | ImportExpensesPage | FileUpload, ColumnMapper, ImportPreview |

---

### Module 4: Income Tracker
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/income | List income entries (filters: date_from, date_to, source_type) |
| POST | /api/v1/income | Add income |
| GET | /api/v1/income/{id} | Get income entry |
| PUT | /api/v1/income/{id} | Update income |
| DELETE | /api/v1/income/{id} | Delete income |
| GET | /api/v1/income/summary | Monthly/yearly summary by source |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /income | IncomePage | IncomeList, IncomeSummaryChart, SavingsRateGauge |
| /income/new | AddIncomePage | IncomeForm, SourceTypePicker |

---

### Module 5: Budget Planner
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/budgets | Get budget plan (params: month, year) |
| POST | /api/v1/budgets | Create/update budget for category |
| PUT | /api/v1/budgets/{id} | Update budget amount |
| DELETE | /api/v1/budgets/{id} | Delete budget entry |
| GET | /api/v1/budgets/variance | Budget vs actual for month |
| GET | /api/v1/budgets/suggestions | AI-suggested budget amounts based on history |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /budgets | BudgetsPage | BudgetCategoryList, BudgetProgressBar, MonthPicker |
| /budgets/new | CreateBudgetPage | BudgetForm, CategoryBudgetRow |

---

### Module 6: Credit Card Tracker
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/credit-cards | List all credit cards |
| POST | /api/v1/credit-cards | Add credit card |
| GET | /api/v1/credit-cards/{id} | Get card details |
| PUT | /api/v1/credit-cards/{id} | Update card |
| DELETE | /api/v1/credit-cards/{id} | Delete card |
| GET | /api/v1/credit-cards/{id}/transactions | Card transactions |
| POST | /api/v1/credit-cards/{id}/transactions | Add transaction |
| GET | /api/v1/credit-cards/utilization | Utilization ratio across all cards |
| GET | /api/v1/credit-cards/due-summary | Upcoming due dates and amounts |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /credit-cards | CreditCardsPage | CreditCardCard, UtilizationBar, DueDateAlert |
| /credit-cards/{id} | CreditCardDetailPage | TransactionList, PaymentTracker |

---

### Module 7: Loan Management
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/loans | List all loans |
| POST | /api/v1/loans | Add loan |
| GET | /api/v1/loans/{id} | Get loan details |
| PUT | /api/v1/loans/{id} | Update loan |
| DELETE | /api/v1/loans/{id} | Delete loan |
| GET | /api/v1/loans/summary | Total outstanding, monthly EMI burden |
| GET | /api/v1/loans/{id}/schedule | Full repayment schedule |
| POST | /api/v1/loans/{id}/schedule/generate | Auto-generate schedule from parameters |
| POST | /api/v1/loans/{id}/schedule/upload | Upload PDF/Excel/CSV schedule |
| PUT | /api/v1/loans/{id}/schedule/{emi_no}/pay | Mark EMI as paid |
| POST | /api/v1/loans/{id}/interest-rate | Update interest rate (auto-recalculates) |
| GET | /api/v1/loans/{id}/interest-history | Rate change history |
| POST | /api/v1/loans/{id}/prepayment/simulate | Simulate prepayment scenarios |
| POST | /api/v1/loans/{id}/prepayment | Record actual prepayment |
| GET | /api/v1/loans/debt-strategy | Get recommended debt closure strategy |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /loans | LoansPage | LoanCard, LoanSummaryStats, EMICalendar |
| /loans/new | AddLoanPage | LoanForm, TenureCalculator |
| /loans/{id} | LoanDetailPage | RepaymentScheduleTable, PrepaymentSimulator, RateHistoryChart |
| /loans/strategy | DebtStrategyPage | StrategySelector, DebtOrderList, DebtFreeCountdown |

---

### Module 8: Investment Tracker
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/investments | List all investments |
| POST | /api/v1/investments | Add investment |
| GET | /api/v1/investments/{id} | Get investment |
| PUT | /api/v1/investments/{id} | Update investment (current value) |
| DELETE | /api/v1/investments/{id} | Delete investment |
| GET | /api/v1/investments/summary | Portfolio summary with allocation |
| GET | /api/v1/investments/by-type | Grouped by investment type |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /investments | InvestmentsPage | InvestmentList, AllocationPieChart, PortfolioSummary |
| /investments/new | AddInvestmentPage | InvestmentForm, TypePicker |

---

### Module 9: Asset & Liability Tracker
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/assets | List all assets |
| POST | /api/v1/assets | Add asset |
| GET | /api/v1/assets/{id} | Get asset |
| PUT | /api/v1/assets/{id} | Update asset (current value) |
| DELETE | /api/v1/assets/{id} | Delete asset |
| POST | /api/v1/assets/{id}/value-history | Record value at date |
| GET | /api/v1/assets/{id}/value-history | Asset value history |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /assets | AssetsPage | AssetList, AssetTypeSummary, AssetValueChart |
| /assets/new | AddAssetPage | AssetForm |

---

### Module 10: Net Worth Dashboard
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/net-worth | Current net worth breakdown (assets, liabilities, net) |
| GET | /api/v1/net-worth/history | Historical net worth (monthly/quarterly/yearly) |
| POST | /api/v1/net-worth/snapshot | Manually trigger snapshot |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /net-worth | NetWorthPage | NetWorthGauge, AssetLiabilityBreakdown, TrendLineChart |

---

### Module 11: Goal Planner
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/goals | List all goals |
| POST | /api/v1/goals | Create goal |
| GET | /api/v1/goals/{id} | Get goal |
| PUT | /api/v1/goals/{id} | Update goal |
| DELETE | /api/v1/goals/{id} | Delete goal |
| POST | /api/v1/goals/{id}/contribute | Add contribution |
| GET | /api/v1/goals/emergency-fund | Emergency fund calculator |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /goals | GoalsPage | GoalCard, GoalProgressBar, EmergencyFundWidget |
| /goals/new | CreateGoalPage | GoalForm, TargetDatePicker, ContributionCalculator |

---

### Module 12: Financial Health Score
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/health-score | Current score with component breakdown |
| GET | /api/v1/health-score/history | Score over time |
| POST | /api/v1/health-score/calculate | Trigger recalculation |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /health-score | HealthScorePage | ScoreGauge, ComponentBreakdown, ImprovementTips |

---

### Module 13: What-If Simulator
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/simulator/salary-change | Simulate salary change impact |
| POST | /api/v1/simulator/prepayment | Simulate loan prepayment impact |
| POST | /api/v1/simulator/rate-change | Simulate interest rate change |
| POST | /api/v1/simulator/investment | Simulate investment growth |
| POST | /api/v1/simulator/retirement | Simulate retirement planning |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /simulator | SimulatorPage | ScenarioSelector, InputSliders, ResultsChart |

---

### Module 14: Tax Planning (India)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/tax/summary | Annual tax summary with deductions |
| GET | /api/v1/tax/regime-comparison | Old vs New regime comparison |
| GET | /api/v1/tax/suggestions | Tax saving recommendations |
| GET | /api/v1/tax/deductions | Detailed deductions breakdown |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /tax | TaxPage | RegimeComparison, DeductionTracker, TaxSavingSuggestions |

---

### Module 15: AI Financial Advisor
**Agents:** BACKEND-AGENT + FRONTEND-AGENT (+ Ollama)

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/ai/recommendations | Get personalized recommendations (cached 24h) |
| POST | /api/v1/ai/analyze | Trigger fresh full financial analysis |
| GET | /api/v1/ai/alerts | Get financial alerts (overspending, missed EMI, etc.) |
| POST | /api/v1/ai/chat | AI chatbot message |
| GET | /api/v1/ai/chat/history | Chat conversation history |

**Agent Architecture:**
```
CoordinatorAgent
├── ExpenseAgent — spending pattern analysis
├── LoanAgent — debt strategies, prepayment recommendations
├── InvestmentAgent — portfolio allocation, SIP recommendations
├── TaxAgent — Indian tax optimization
├── BudgetAgent — budget optimization
├── GoalAgent — goal achievement strategies
└── RetirementAgent — retirement corpus planning
```

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /ai-advisor | AIAdvisorPage | RecommendationList, AlertBanner, AnalysisStatus |
| /chat | ChatPage | ChatInterface, MessageBubble, SuggestedQueries |

---

### Module 16: Document Management
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/documents | List documents |
| POST | /api/v1/documents/upload | Upload document (multipart/form-data, async OCR) |
| GET | /api/v1/documents/{id} | Get document metadata |
| GET | /api/v1/documents/{id}/extracted | Get OCR extracted data |
| DELETE | /api/v1/documents/{id} | Delete document |
| GET | /api/v1/documents/{id}/download | Download document |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /documents | DocumentsPage | DocumentVault, UploadZone, OCRStatusBadge |

---

### Module 17: Notifications & Calendar
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/notifications | Get notifications (unread first) |
| PUT | /api/v1/notifications/{id}/read | Mark as read |
| PUT | /api/v1/notifications/read-all | Mark all as read |
| GET | /api/v1/calendar | Calendar events for month (params: month, year) |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /notifications | NotificationsPage | NotificationList, NotificationBell |
| /calendar | CalendarPage | FinancialCalendar, EventTooltip, DueDateHighlight |

---

### Module 18: Reports
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/reports/expense | Expense report (params: start_date, end_date, format) |
| GET | /api/v1/reports/income | Income report |
| GET | /api/v1/reports/cash-flow | Cash flow report |
| GET | /api/v1/reports/loan | Loan/debt report |
| GET | /api/v1/reports/net-worth | Net worth trend report |
| GET | /api/v1/reports/tax | Tax planning report |
| POST | /api/v1/reports/export | Export report as PDF/Excel/CSV |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /reports | ReportsPage | ReportTypeSelector, DateRangePicker, ExportButton, ReportPreview |

---

### Module 19: Insurance & Subscription Tracker
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/insurance | List insurance policies |
| POST | /api/v1/insurance | Add policy |
| PUT | /api/v1/insurance/{id} | Update policy |
| DELETE | /api/v1/insurance/{id} | Delete policy |
| GET | /api/v1/subscriptions | List subscriptions |
| POST | /api/v1/subscriptions | Add subscription |
| PUT | /api/v1/subscriptions/{id} | Update subscription |
| DELETE | /api/v1/subscriptions/{id} | Delete subscription |
| GET | /api/v1/subscriptions/monthly-cost | Total monthly subscription cost |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /insurance | InsurancePage | InsuranceList, RenewalAlert |
| /subscriptions | SubscriptionsPage | SubscriptionList, MonthlyCostSummary |

---

### Module 20: Admin Panel
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/admin/users | List all users (paginated) |
| GET | /api/v1/admin/users/{id} | Get user details |
| PUT | /api/v1/admin/users/{id}/status | Enable/disable user |
| GET | /api/v1/admin/stats | Platform statistics |
| GET | /api/v1/admin/audit-logs | System audit trail (paginated) |

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /admin | AdminDashboardPage | PlatformStats, UserGrowthChart |
| /admin/users | AdminUsersPage | UserDataTable, StatusToggle, UserSearch |

---

### Module 21: Main Dashboard
**Agents:** FRONTEND-AGENT

**Frontend Pages:**
| Route | Page | Key Components |
|-------|------|----------------|
| /dashboard | DashboardPage | NetWorthWidget, CashFlowChart, TopExpensesDonut, LoanSummaryWidget, HealthScoreWidget, UpcomingPaymentsWidget, GoalProgressWidget, AIRecommendationTeaser |

---

## PHASE EXECUTION PLAN

### Phase 1: Foundation (4 agents in parallel)

**DATABASE-AGENT tasks:**
- Create all 25+ SQLAlchemy models in `backend/app/models/`
- Generate Alembic migration: `alembic revision --autogenerate -m "initial"`
- Create `database.py` with connection pool settings
- Seed Indian expense categories (20 categories)
- Create `__init__.py` exports for all models

**BACKEND-AGENT tasks:**
- Initialize FastAPI project structure
- Create `main.py` (app factory, CORS, middleware, routers registration)
- Create `config.py` (Pydantic Settings with env validation)
- Create `database.py` (SQLAlchemy session factory)
- Create Pydantic schemas skeleton for all modules
- Setup JWT utilities in `auth/`

**FRONTEND-AGENT tasks:**
- Initialize Vite + React + TypeScript project
- Install and configure Chakra UI, Framer Motion, Recharts
- Create folder structure: pages/, components/, hooks/, services/, context/, types/
- Create `api.ts` axios instance with interceptors (token refresh)
- Create `AuthContext.tsx` with JWT storage
- Create base layout: `MainLayout.tsx`, `Sidebar.tsx`, `Navbar.tsx`
- Setup React Router with protected route wrapper

**DEVOPS-AGENT tasks:**
- Create `docker-compose.yml` (postgres, backend, frontend, nginx, ollama)
- Create `backend/Dockerfile` and `frontend/Dockerfile`
- Create `nginx/nginx.conf`
- Create `.env.example` with all required variables
- Create `alembic.ini` and `alembic/env.py`
- Setup Ollama container and model pull script

**Validation Gate 1:**
```bash
cd backend && pip install -r requirements.txt
alembic upgrade head
cd ../frontend && npm install && npm run type-check
docker-compose config
```

---

### Phase 2: Backend Modules (parallel per module group)

**Group A (Core Finance Data — highest priority):**
- Auth module: register, login, refresh, me, password reset
- Account Management: CRUD + balance management
- Expense Tracker: CRUD + summary + categories + recurring
- Income Tracker: CRUD + summary

**Group B (Planning & Analysis):**
- Budget Planner: CRUD + variance analysis
- Loan Management: CRUD + schedule generation + rate change engine + prepayment
- Investment Tracker: CRUD + portfolio summary
- Asset Tracker: CRUD + value history

**Group C (Intelligence & Advanced):**
- Net Worth: calculation engine + history snapshots (background job)
- Financial Health Score: scoring engine
- AI Financial Advisor: LangChain agents + Ollama integration
- Document Management: upload + async OCR (Tesseract + PyMuPDF)

**Group D (Supporting):**
- Goal Planner: CRUD + contribution tracking
- Credit Card Tracker: CRUD + utilization
- Tax Planning: calculation engine (Indian IT rules)
- What-If Simulator: scenario calculation engines
- Reports: generation + export (PDF/Excel)
- Notifications + Calendar: event aggregation
- Insurance + Subscriptions: CRUD
- Admin Panel: user management + stats

**Validation Gate 2:**
```bash
ruff check backend/ --fix
mypy backend/app --ignore-missing-imports
pytest backend/tests/ -v --cov=app --cov-report=term-missing
```

---

### Phase 3: Frontend Modules (parallel with backend)

Build all pages and components for each module listed above. Priority order matches backend groups.

**Key shared components to build first:**
- `INRAmount.tsx` — formats numbers as ₹1,23,456
- `DateRangePicker.tsx`
- `DataTable.tsx` (with pagination, sort, filter)
- `EmptyState.tsx`
- `LoadingSpinner.tsx`
- `ConfirmDialog.tsx`
- `ChartWrapper.tsx` (Recharts wrapper with Chakra theming)

**Validation Gate 3:**
```bash
cd frontend && npm run lint && npm run type-check && npm test
```

---

### Phase 4: Quality (3 agents in parallel)

**TEST-AGENT tasks:**
- Backend: pytest unit tests for all services (target 80%+ coverage)
  - Auth service: register, login, token refresh
  - Loan service: schedule generation, interest rate recalculation, prepayment calculation
  - Budget service: variance calculation
  - Net worth engine: calculation correctness
  - AI service: mock Ollama calls
  - OCR service: mock Tesseract calls
- Frontend: React Testing Library tests
  - LoginPage, RegisterPage
  - ExpenseForm, ExpenseList
  - LoanDetailPage
  - DashboardPage

**REVIEW-AGENT tasks:**
- Security audit: SQL injection, XSS, CORS, JWT validation, rate limiting
- Performance: N+1 query detection, missing indexes, slow endpoints
- Code quality: DRY violations, missing error handling, type coverage

**Final Validation:**
```bash
docker-compose up -d
curl http://localhost:8000/health
curl http://localhost:8000/docs
pytest backend/tests/ --cov=app --cov-fail-under=80
docker-compose logs --tail=20
```

---

## VALIDATION GATES

| Gate | Commands | Pass Criteria |
|------|----------|---------------|
| 1 | `alembic upgrade head` | No migration errors |
| 1 | `npm install` | No peer dependency errors |
| 1 | `docker-compose config` | No YAML errors |
| 2 | `ruff check backend/` | Zero linting errors |
| 2 | `mypy backend/app` | Zero type errors |
| 2 | `pytest backend/tests/ -v` | All tests pass |
| 3 | `npm run type-check` | Zero TypeScript errors |
| 3 | `npm run lint` | Zero ESLint errors |
| 3 | `npm test` | All tests pass |
| Final | `docker-compose up -d` | All containers healthy |
| Final | `pytest --cov-fail-under=80` | Coverage ≥ 80% |
| Final | `curl localhost:8000/health` | 200 OK |

---

## ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://arthaa_user:arthaa_pass@localhost:5432/arthaa

# Auth
SECRET_KEY=change-this-to-a-long-random-secret-key-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# AI (Ollama)
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=deepseek-r1:7b
AI_CACHE_TTL_HOURS=24

# OCR
TESSERACT_CMD=/usr/bin/tesseract

# File Storage
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE_MB=10
ALLOWED_FILE_TYPES=pdf,jpg,jpeg,png

# App
APP_ENV=development
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:5173

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## FILE STRUCTURE TO CREATE

```
arthaa/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
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
│   │   │   ├── ai_recommendation.py
│   │   │   ├── net_worth_history.py
│   │   │   ├── financial_health_score.py
│   │   │   └── audit_log.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── account.py
│   │   │   ├── expense.py
│   │   │   ├── income.py
│   │   │   ├── budget.py
│   │   │   ├── credit_card.py
│   │   │   ├── loan.py
│   │   │   ├── investment.py
│   │   │   ├── asset.py
│   │   │   ├── goal.py
│   │   │   ├── net_worth.py
│   │   │   ├── health_score.py
│   │   │   ├── ai.py
│   │   │   ├── document.py
│   │   │   ├── report.py
│   │   │   ├── insurance.py
│   │   │   ├── subscription.py
│   │   │   ├── notification.py
│   │   │   ├── tax.py
│   │   │   ├── simulator.py
│   │   │   └── admin.py
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── accounts.py
│   │   │   ├── expenses.py
│   │   │   ├── income.py
│   │   │   ├── budgets.py
│   │   │   ├── credit_cards.py
│   │   │   ├── loans.py
│   │   │   ├── investments.py
│   │   │   ├── assets.py
│   │   │   ├── goals.py
│   │   │   ├── net_worth.py
│   │   │   ├── health_score.py
│   │   │   ├── ai.py
│   │   │   ├── documents.py
│   │   │   ├── reports.py
│   │   │   ├── notifications.py
│   │   │   ├── calendar.py
│   │   │   ├── insurance.py
│   │   │   ├── subscriptions.py
│   │   │   ├── tax.py
│   │   │   ├── simulator.py
│   │   │   └── admin.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py
│   │   │   ├── account_service.py
│   │   │   ├── expense_service.py
│   │   │   ├── income_service.py
│   │   │   ├── budget_service.py
│   │   │   ├── loan_service.py
│   │   │   ├── loan_calculator.py  ← EMI/schedule math
│   │   │   ├── investment_service.py
│   │   │   ├── asset_service.py
│   │   │   ├── net_worth_service.py
│   │   │   ├── health_score_service.py
│   │   │   ├── tax_service.py
│   │   │   ├── simulator_service.py
│   │   │   ├── report_service.py
│   │   │   ├── ocr_service.py
│   │   │   ├── import_service.py  ← CSV/Excel parsing
│   │   │   └── notification_service.py
│   │   ├── ai/
│   │   │   ├── __init__.py
│   │   │   ├── ollama_client.py
│   │   │   ├── coordinator_agent.py
│   │   │   ├── expense_agent.py
│   │   │   ├── loan_agent.py
│   │   │   ├── investment_agent.py
│   │   │   ├── budget_agent.py
│   │   │   ├── goal_agent.py
│   │   │   ├── tax_agent.py
│   │   │   └── prompts/
│   │   │       ├── expense_prompts.py
│   │   │       ├── loan_prompts.py
│   │   │       └── budget_prompts.py
│   │   └── auth/
│   │       ├── __init__.py
│   │       ├── jwt.py
│   │       ├── password.py
│   │       └── dependencies.py
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   ├── test_expenses.py
│   │   ├── test_loans.py
│   │   ├── test_net_worth.py
│   │   └── test_health_score.py
│   ├── requirements.txt
│   ├── alembic.ini
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Navbar.tsx
│   │   │   ├── shared/
│   │   │   │   ├── INRAmount.tsx
│   │   │   │   ├── DataTable.tsx
│   │   │   │   ├── DateRangePicker.tsx
│   │   │   │   ├── EmptyState.tsx
│   │   │   │   ├── LoadingSpinner.tsx
│   │   │   │   └── ConfirmDialog.tsx
│   │   │   └── charts/
│   │   │       ├── AreaChart.tsx
│   │   │       ├── PieChart.tsx
│   │   │       └── BarChart.tsx
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── expenses/
│   │   │   ├── income/
│   │   │   ├── budgets/
│   │   │   ├── loans/
│   │   │   ├── investments/
│   │   │   ├── assets/
│   │   │   ├── goals/
│   │   │   ├── credit-cards/
│   │   │   ├── net-worth/
│   │   │   ├── health-score/
│   │   │   ├── ai-advisor/
│   │   │   ├── chat/
│   │   │   ├── documents/
│   │   │   ├── reports/
│   │   │   ├── tax/
│   │   │   ├── simulator/
│   │   │   ├── calendar/
│   │   │   ├── notifications/
│   │   │   ├── insurance/
│   │   │   ├── subscriptions/
│   │   │   └── admin/
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useExpenses.ts
│   │   │   ├── useLoans.ts
│   │   │   └── useNetWorth.ts
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── authService.ts
│   │   │   ├── expenseService.ts
│   │   │   └── loanService.ts
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   └── types/
│   │       ├── auth.ts
│   │       ├── expense.ts
│   │       ├── loan.ts
│   │       └── common.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
├── .env.example
├── INITIAL.md
├── CLAUDE.md
└── PRPs/
    └── arthaa-prp.md
```

---

## AGENT DISPATCH INSTRUCTIONS

### DATABASE-AGENT
```yaml
TO: DATABASE-AGENT
TASK: Create all SQLAlchemy models and Alembic migration
READ: skills/DATABASE.md
INPUTS:
  - All model definitions from MODULES section above
  - Store amounts in INR paise (integer), NOT float
  - Use PostgreSQL ARRAY type for tags
  - Add created_at/updated_at to all models
  - Add DB indexes on user_id, date columns (frequently queried)
OUTPUTS:
  - backend/app/models/*.py (one file per model group)
  - alembic/versions/001_initial.py (migration)
  - Initial data seed: 20 Indian expense categories
VALIDATION:
  - alembic upgrade head (no errors)
  - alembic current (shows head)
```

### BACKEND-AGENT
```yaml
TO: BACKEND-AGENT
TASK: Build all FastAPI endpoints and business logic
READ: skills/BACKEND.md
INPUTS:
  - All endpoint specs from MODULES section above
  - Database models from DATABASE-AGENT
  - JWT auth pattern: all protected routes use Depends(get_current_user)
  - Always filter queries by user_id (never expose other users' data)
  - Use background tasks for: OCR processing, AI analysis, net worth snapshots
OUTPUTS:
  - backend/app/routers/*.py
  - backend/app/services/*.py
  - backend/app/schemas/*.py
  - backend/app/ai/*.py
VALIDATION:
  - ruff check backend/ (zero errors)
  - pytest backend/tests/ (all pass)
  - curl localhost:8000/docs (Swagger accessible)
```

### FRONTEND-AGENT
```yaml
TO: FRONTEND-AGENT
TASK: Build all React pages and components
READ: skills/FRONTEND.md
INPUTS:
  - All page specs from MODULES section above
  - Use Chakra UI for all components (no inline styles)
  - Format all amounts using INRAmount component (₹ with Indian number format)
  - Handle loading/error states on every data fetch
  - Protected routes redirect to /login if not authenticated
OUTPUTS:
  - frontend/src/pages/**/*.tsx
  - frontend/src/components/**/*.tsx
  - frontend/src/hooks/*.ts
  - frontend/src/services/*.ts
VALIDATION:
  - npm run type-check (zero TS errors)
  - npm run lint (zero ESLint errors)
```

### DEVOPS-AGENT
```yaml
TO: DEVOPS-AGENT
TASK: Setup Docker Compose stack and infrastructure
READ: skills/DEPLOYMENT.md
INPUTS:
  - Services: postgres, backend (FastAPI), frontend (Nginx), nginx (reverse proxy), ollama
  - Ollama needs GPU passthrough (optional, CPU fallback)
  - Postgres needs volume for data persistence
  - Uploads directory needs persistent volume
OUTPUTS:
  - docker-compose.yml
  - backend/Dockerfile
  - frontend/Dockerfile
  - nginx/nginx.conf
  - .env.example
VALIDATION:
  - docker-compose config (no errors)
  - docker-compose build (all images build)
  - docker-compose up -d && curl localhost:8000/health
```

---

## INDIA-SPECIFIC IMPLEMENTATION NOTES

1. **Currency:** All amounts stored as integers in paise (₹1 = 100 paise). Display using `INRAmount` component with Indian number formatting (1,23,456 not 123,456).

2. **Fiscal Year:** April to March. All year-based reports must respect this. `fiscal_year_start_month=4` in Settings.

3. **Tax Sections:** 80C limit ₹1,50,000 | 80D limit ₹25,000 (self) / ₹50,000 (senior parents) | NPS 80CCD(1B) additional ₹50,000.

4. **Loan Math:** Indian home loans use monthly reducing balance. Formula:
   `EMI = P × r × (1+r)^n / ((1+r)^n - 1)` where r = annual_rate/12/100, n = tenure_months.

5. **Indian Banks Preset:** SBI, HDFC, ICICI, Axis, Kotak, Indian Bank, IOB, PNB, Bank of Baroda, Canara Bank + "Other".

6. **Investment Types India:** PPF (15-yr lock-in), EPF (employer PF), NPS (60 retirement), ELSS (3-yr lock-in, 80C eligible), SIP (monthly MF investment), FD (bank fixed deposit).

---

## NEXT STEP

```bash
/execute-prp PRPs/arthaa-prp.md
```
