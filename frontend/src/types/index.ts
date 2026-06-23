export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  detail: string;
  code: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  is_active: boolean;
  role: 'user' | 'admin';
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Account {
  id: number;
  name: string;
  account_type: 'bank' | 'cash' | 'wallet' | 'upi';
  bank_name: string | null;
  balance: number; // paise
  is_active: boolean;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_system: boolean;
}

export interface Expense {
  id: number;
  account_id: number | null;
  category_id: number;
  category: ExpenseCategory;
  date: string;
  amount: number; // paise
  description: string | null;
  payment_method: string | null;
  tags: string[];
  is_recurring: boolean;
  created_at: string;
}

export interface Income {
  id: number;
  account_id: number | null;
  source_type: string;
  amount: number; // paise
  date: string;
  description: string | null;
}

export interface Budget {
  id: number;
  month: number;
  year: number;
  category_id: number;
  category?: ExpenseCategory;
  budgeted_amount: number;  // paise
  spent_amount: number;     // paise, computed
  remaining_amount: number; // paise, computed
  utilization_pct: number;  // 0-100+
}

export interface RateHistory {
  id: number;
  old_rate: number;
  new_rate: number;
  effective_date: string;
  emi_impact: number | null;     // paise — positive = EMI went up
  tenure_impact: number | null;  // months — positive = tenure extended
  adjust_type: string | null;    // 'emi' | 'tenure'
  note: string | null;
  created_at: string;
}

export interface Loan {
  id: number;
  loan_type: string;
  bank_name: string;
  loan_account_number: string | null;
  loan_amount: number;            // paise
  outstanding_balance: number;    // paise
  starting_interest_rate: number | null; // original rate when loan was taken
  interest_rate: number;          // current rate
  emi_amount: number;             // paise
  start_date: string;
  tenure_months: number;
  remaining_tenure: number;
  is_floating: boolean;
  repayment_type: 'emi' | 'bullet';
  total_interest_payable: number;          // paise, computed
  accrued_interest: number;               // paise, interest since last payment (bullet only)
  total_interest_paid: number;            // paise, cumulative paid (bullet only)
  last_interest_payment_date: string | null;
  created_at: string;
}

export interface CreditCard {
  id: number;
  card_name: string;
  bank_name: string;
  last4_digits: string;
  credit_limit: number;        // paise
  outstanding_balance: number; // paise
  due_date: number | null;     // day of month
  minimum_due: number;         // paise
  interest_rate: number | null;
  rewards_points: number;
  is_active: boolean;
  utilization_pct: number;     // 0-100+
  days_until_due: number | null;
  created_at: string;
}

export interface CreditCardTransaction {
  id: number;
  credit_card_id: number;
  amount: number;              // paise, always positive
  description: string | null;
  date: string;
  category_id: number | null;
  is_payment: boolean;
  created_at: string;
}

export interface GoldInterestPayment {
  id: number;
  loan_id: number;
  amount: number;       // paise
  payment_date: string;
  note: string | null;
  created_at: string;
}

export interface RepaymentScheduleRow {
  id: number;
  loan_id: number;
  emi_number: number;
  principal: number;         // paise
  interest: number;          // paise
  outstanding_balance: number; // paise
  due_date: string;
  paid: boolean;
  paid_date: string | null;
}

export interface Investment {
  id: number;
  investment_type: string;
  name: string;
  invested_amount: number;   // paise
  current_value: number;     // paise
  gain_loss: number;         // paise, computed
  returns_pct: number | null;
  start_date: string | null;
  maturity_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface Asset {
  id: number;
  asset_type: string;
  name: string;
  purchase_value: number;    // paise
  current_value: number;     // paise
  appreciation: number;      // paise, computed
  purchase_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface Goal {
  id: number;
  goal_type: string;
  name: string;
  target_amount: number;     // paise
  current_amount: number;    // paise
  progress_pct: number;      // 0-100, computed
  target_date: string | null;
  monthly_contribution: number | null; // paise
  priority: number;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
}

export interface NetWorthSnapshot {
  total_assets: number;      // paise
  total_liabilities: number; // paise
  net_worth: number;         // paise
  recorded_date: string;
}

export interface FinancialHealthScore {
  score: number;
  savings_ratio_score: number;
  debt_ratio_score: number;
  emergency_fund_score: number;
  investment_ratio_score: number;
  insurance_score: number;
  credit_utilization_score: number;
  rating: 'poor' | 'average' | 'good' | 'excellent';
  recorded_date: string;
}

export interface AIRecommendation {
  id: number;
  recommendation_type: string;
  title: string;
  content: Record<string, unknown>;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}
