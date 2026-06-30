import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Badge, Progress,
  Spinner, Flex, Avatar, Divider, CircularProgress, CircularProgressLabel,
  useColorModeValue, Link as ChakraLink, Stat, StatLabel, StatNumber,
  Table, Thead, Tbody, Tr, Th, Td, TableContainer,
} from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../context/AuthContext';
import { formatINR, getScoreColor } from '../../lib/utils';
import api from '../../services/api';
import type { NetWorthSnapshot, FinancialHealthScore, Loan, Account, Income, Expense } from '../../types';

// ── types ─────────────────────────────────────────────────────────────────────

interface CashFlowRow { month: string; income: number; expense: number; savings: number; savings_rate: number }
interface CashFlowData { rows: CashFlowRow[]; total_income: number; total_expense: number; savings_rate: number }
interface Budget { id: number; category_name: string; category_icon: string; limit_amount: number; spent_amount: number; period: string }
interface Goal   { id: number; name: string; icon: string; target_amount: number; current_amount: number; target_date: string }
interface Investment { id: number; name: string; investment_type: string; invested_amount: number; current_value: number }

// ── helpers ───────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function currentMonthRange(): [string, string, number, number] {
  const n    = new Date();
  const m    = n.getMonth() + 1;
  const y    = n.getFullYear();
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(y, m, 0).getDate();
  const to   = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return [from, to, m, y];
}

const PIE_COLORS  = ['#805ad5','#e53e3e','#3182ce','#38a169','#d69e2e','#dd6b20','#319795','#718096'];
const ACC_ICON:   Record<string, string> = { bank: '🏦', cash: '💵', wallet: '👛', upi: '📱' };
const LOAN_ICON:  Record<string, string> = { home: '🏠', personal: '👤', gold: '🥇', car: '🚗', education: '🎓', credit_card: '💳', other: '🏦' };
const INV_ICON:   Record<string, string> = { mutual_fund: '📊', stocks: '📈', fd: '🏦', ppf: '📋', nps: '🏛️', gold: '🥇', real_estate: '🏠', crypto: '₿', other: '💼' };
const SRC_COLOR:  Record<string, string> = { salary: 'green', bonus: 'yellow', freelancing: 'blue', rental: 'orange', dividend: 'teal', interest: 'cyan', other: 'gray' };

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'gray.700', isLoading = false, to }: {
  label: string; value: string; sub?: string; color?: string; isLoading?: boolean; to?: string;
}) {
  const inner = (
    <GlassCard p={5} h="100%">
      <Text fontSize="xs" color="gray.500" fontWeight="semibold" textTransform="uppercase" letterSpacing="wide">{label}</Text>
      {isLoading
        ? <Spinner size="sm" color="purple.500" mt={2} />
        : <Text fontSize="xl" fontWeight="black" color={color} mt={1} noOfLines={1}>{value}</Text>
      }
      {sub && <Text fontSize="11px" color="gray.400" mt={0.5}>{sub}</Text>}
    </GlassCard>
  );
  return to ? <ChakraLink as={Link} to={to} _hover={{ textDecor: 'none' }}>{inner}</ChakraLink> : inner;
}

function SectionHeader({ title, to }: { title: string; to: string }) {
  return (
    <HStack justify="space-between" mb={3}>
      <Text fontSize="sm" fontWeight="semibold" color="gray.600" _dark={{ color: 'gray.300' }}>{title}</Text>
      <ChakraLink as={Link} to={to} fontSize="11px" color="purple.500" _hover={{ textDecor: 'underline' }}>See all →</ChakraLink>
    </HStack>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.full_name?.split(' ')[0] ?? 'there';
  const todayStr  = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const [expFrom, expTo, curMon, curYr] = useMemo(currentMonthRange, []);
  const curYear = new Date().getFullYear();
  const currentMonthName = new Date().toLocaleString('en-IN', { month: 'long' });
  const dimText = useColorModeValue('gray.500', 'gray.400');

  // ── parallel queries ──────────────────────────────────────────────────────

  const nwQ     = useQuery<NetWorthSnapshot>({ queryKey: ['net-worth-latest'],      queryFn: () => api.get('/net-worth/latest').then(r => r.data),                                   retry: false });
  const hsQ     = useQuery<FinancialHealthScore>({ queryKey: ['health-score-latest'], queryFn: () => api.get('/health-score/latest').then(r => r.data),                               retry: false });
  const cfQ     = useQuery<CashFlowData>({ queryKey: ['dash-cashflow', curYear],    queryFn: () => api.get('/reports/cash-flow', { params: { year: curYear, fiscal: false } }).then(r => r.data), retry: false });
  const loansQ  = useQuery<{ data: Loan[] }>({ queryKey: ['dash-loans'],            queryFn: () => api.get('/loans',   { params: { page: 1, limit: 10 } }).then(r => r.data) });
  const accsQ   = useQuery<{ data: Account[] }>({ queryKey: ['dash-accounts'],      queryFn: () => api.get('/accounts',{ params: { page: 1, limit: 10 } }).then(r => r.data) });

  // Direct income — current month
  const incomeQ = useQuery<{ data: Income[] }>({
    queryKey: ['dash-income', curMon, curYr],
    queryFn:  () => api.get('/income', { params: { month: curMon, year: curYr, limit: 50 } }).then(r => r.data),
  });

  // Recent expenses — current month
  const expQ = useQuery<{ data: Expense[] }>({
    queryKey: ['dash-expense', expFrom, expTo],
    queryFn:  () => api.get('/expenses', { params: { from_date: expFrom, to_date: expTo, limit: 200 } }).then(r => r.data),
  });

  // Budgets — current month
  const budgetsQ = useQuery<{ data: Budget[] }>({
    queryKey: ['dash-budgets', curMon, curYr],
    queryFn:  () => api.get('/budgets', { params: { month: curMon, year: curYr, limit: 20 } }).then(r => r.data),
    retry: false,
  });

  // Goals
  const goalsQ = useQuery<{ data: Goal[] }>({
    queryKey: ['dash-goals'],
    queryFn:  () => api.get('/goals', { params: { limit: 5 } }).then(r => r.data),
    retry: false,
  });

  // Investments
  const invQ = useQuery<{ data: Investment[] }>({
    queryKey: ['dash-investments'],
    queryFn:  () => api.get('/investments', { params: { limit: 20 } }).then(r => r.data),
    retry: false,
  });

  // ── derived values ────────────────────────────────────────────────────────

  const cfRows      = cfQ.data?.rows ?? [];
  const last6       = cfRows.slice(-6);
  const curMonthRow = cfRows.find(r => r.month === currentMonthName) ?? cfRows[cfRows.length - 1];

  const incomes     = incomeQ.data?.data ?? [];
  const monthIncome = incomes.reduce((s, i) => s + i.amount, 0);

  const expenses    = expQ.data?.data ?? [];
  const monthExpense = expenses.reduce((s, e) => s + e.amount, 0);

  // Category breakdown from expenses
  const catMap: Record<string, { name: string; icon: string; color: string; amount: number }> = {};
  expenses.forEach(e => {
    const k = e.category?.name ?? 'Other';
    if (!catMap[k]) catMap[k] = { name: k, icon: e.category?.icon ?? '💰', color: e.category?.color ?? '#718096', amount: 0 };
    catMap[k].amount += e.amount;
  });
  const expCats = Object.values(catMap).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const expTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const savingsRate   = monthIncome > 0 ? Math.round((monthIncome - monthExpense) / monthIncome * 100) : 0;
  const savings       = monthIncome - monthExpense;

  const activeLoans   = (loansQ.data?.data ?? []).filter(l => l.outstanding_balance > 0);
  const accounts      = accsQ.data?.data ?? [];
  const liquidTotal   = accounts.reduce((s, a) => s + a.balance, 0);

  const budgets       = budgetsQ.data?.data ?? [];
  const goals         = goalsQ.data?.data   ?? [];
  const investments   = invQ.data?.data     ?? [];
  const invTotal      = investments.reduce((s, i) => s + i.current_value, 0);
  const invGain       = investments.reduce((s, i) => s + (i.current_value - i.invested_amount), 0);

  const recentExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  const netWorth    = nwQ.data;
  const healthScore = hsQ.data;
  const scoreColor  = healthScore ? getScoreColor(healthScore.score) : 'gray';
  const scoreRating = healthScore?.rating ?? '';

  // Income source breakdown
  const srcMap: Record<string, number> = {};
  incomes.forEach(i => { srcMap[i.source_type] = (srcMap[i.source_type] ?? 0) + i.amount; });
  const incomeSources = Object.entries(srcMap).map(([k, v]) => ({ label: k, amount: v })).sort((a, b) => b.amount - a.amount);

  // Financial snapshot: Income → EMI → Balance
  const totalEMI        = activeLoans.reduce((s, l) => s + l.emi_amount, 0);
  const afterEMI        = monthIncome - totalEMI;
  const savingsTarget   = Math.round(monthIncome * 0.20);
  const availableToSave = afterEMI - savingsTarget;
  // Priority loan: highest interest rate first (fastest to close = most savings)
  const priorityLoan    = [...activeLoans].sort((a, b) => b.interest_rate - a.interest_rate)[0] ?? null;
  const totalOutstanding = activeLoans.reduce((s, l) => s + l.outstanding_balance, 0);

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={5}>

        {/* ── Header ── */}
        <GlassCard
          noHover
          bgGradient="linear(135deg, purple.600 0%, purple.400 50%, pink.400 100%)"
          p={6} borderRadius="2xl"
        >
          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <HStack spacing={4}>
              <Avatar size="md" name={user?.full_name ?? 'U'} bg="whiteAlpha.300" color="white" fontWeight="bold" />
              <Box>
                <Text fontSize="xs" color="whiteAlpha.700">{todayStr}</Text>
                <Heading size="md" color="white">{greeting()}, {firstName} 👋</Heading>
                <Text fontSize="sm" color="whiteAlpha.800">Here's your complete financial overview</Text>
              </Box>
            </HStack>
            {healthScore && (
              <Box textAlign="center">
                <CircularProgress value={healthScore.score} max={100}
                  color={`${scoreColor}.300`} trackColor="whiteAlpha.200" size="70px" thickness="8px">
                  <CircularProgressLabel>
                    <Text fontSize="lg" fontWeight="black" color="white">{healthScore.score}</Text>
                  </CircularProgressLabel>
                </CircularProgress>
                <Text fontSize="10px" color="whiteAlpha.700" mt={1} textTransform="capitalize">{scoreRating} health</Text>
              </Box>
            )}
          </HStack>
        </GlassCard>

        {/* ── KPI row ── */}
        <SimpleGrid columns={{ base: 2, md: 3, lg: 6 }} spacing={3}>
          <KpiCard label="Net Worth"      value={netWorth ? formatINR(netWorth.net_worth) : '—'}    sub="Assets − Liabilities"   color={netWorth && netWorth.net_worth >= 0 ? 'purple.600' : 'red.500'} isLoading={nwQ.isLoading}      to="/net-worth" />
          <KpiCard label="Monthly Income" value={incomeQ.isLoading ? '…' : formatINR(monthIncome)}  sub={currentMonthName}        color="green.500"  isLoading={incomeQ.isLoading}  to="/income" />
          <KpiCard label="Monthly Expense"value={expQ.isLoading    ? '…' : formatINR(monthExpense)} sub={currentMonthName}        color="red.500"    isLoading={expQ.isLoading}     to="/expenses" />
          <KpiCard label="Savings"        value={incomeQ.isLoading || expQ.isLoading ? '…' : formatINR(Math.max(0, savings))} sub={`${savingsRate}% rate`} color={savingsRate >= 20 ? 'green.500' : 'orange.500'} to="/reports" />
          <KpiCard label="Investments"    value={invQ.isLoading ? '…' : formatINR(invTotal)}        sub={invGain >= 0 ? `+${formatINR(invGain)} gain` : `${formatINR(invGain)} loss`} color={invGain >= 0 ? 'teal.500' : 'red.500'} isLoading={invQ.isLoading} to="/investments" />
          <KpiCard label="Health Score"   value={healthScore ? `${healthScore.score}/100` : '—'}    sub={scoreRating}             color={`${scoreColor}.500`} isLoading={hsQ.isLoading} to="/health-score" />
        </SimpleGrid>

        {/* ── Financial Snapshot ── */}
        {monthIncome > 0 && (
          <GlassCard p={5} noHover>
            <HStack justify="space-between" mb={4} flexWrap="wrap" gap={2}>
              <Box>
                <Text fontSize="sm" fontWeight="semibold">💰 Monthly Financial Snapshot</Text>
                <Text fontSize="xs" color={dimText}>{currentMonthName} — after EMIs &amp; savings target</Text>
              </Box>
              {priorityLoan && (
                <Badge colorScheme="orange" variant="subtle" fontSize="xs" px={3} py={1}>
                  🎯 Priority: Close {priorityLoan.bank_name} ({priorityLoan.interest_rate}% p.a.)
                </Badge>
              )}
            </HStack>

            {/* Flow: Income → EMI → After EMI → Savings → Free cash */}
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={5}>
              <Box p={4} bg="green.50" _dark={{ bg: 'green.900' }} borderRadius="xl" borderLeftWidth="4px" borderLeftColor="green.400">
                <Text fontSize="xs" color="gray.500" mb={1}>Monthly Income</Text>
                <Text fontSize="lg" fontWeight="black" color="green.600">{formatINR(monthIncome)}</Text>
              </Box>
              <Box p={4} bg="red.50" _dark={{ bg: 'red.900' }} borderRadius="xl" borderLeftWidth="4px" borderLeftColor="red.400">
                <Text fontSize="xs" color="gray.500" mb={1}>Total EMIs</Text>
                <Text fontSize="lg" fontWeight="black" color="red.600">− {formatINR(totalEMI)}</Text>
                <Text fontSize="10px" color="gray.400">{activeLoans.length} active loan{activeLoans.length !== 1 ? 's' : ''}</Text>
              </Box>
              <Box p={4} bg={afterEMI >= 0 ? 'blue.50' : 'red.50'} _dark={{ bg: afterEMI >= 0 ? 'blue.900' : 'red.900' }} borderRadius="xl" borderLeftWidth="4px" borderLeftColor={afterEMI >= 0 ? 'blue.400' : 'red.400'}>
                <Text fontSize="xs" color="gray.500" mb={1}>After EMIs</Text>
                <Text fontSize="lg" fontWeight="black" color={afterEMI >= 0 ? 'blue.600' : 'red.600'}>{formatINR(afterEMI)}</Text>
                <Text fontSize="10px" color="gray.400">{monthIncome > 0 ? Math.round((totalEMI / monthIncome) * 100) : 0}% of income</Text>
              </Box>
              <Box p={4} bg="purple.50" _dark={{ bg: 'purple.900' }} borderRadius="xl" borderLeftWidth="4px" borderLeftColor="purple.400">
                <Text fontSize="xs" color="gray.500" mb={1}>Save 20% Target</Text>
                <Text fontSize="lg" fontWeight="black" color="purple.600">− {formatINR(savingsTarget)}</Text>
                <Text fontSize="10px" color={availableToSave >= 0 ? 'green.500' : 'red.500'}>
                  {availableToSave >= 0 ? `₹${(availableToSave/100).toFixed(0)} free cash` : `Shortfall ₹${(Math.abs(availableToSave)/100).toFixed(0)}`}
                </Text>
              </Box>
            </SimpleGrid>

            {/* Visual flow bar */}
            {monthIncome > 0 && (
              <Box>
                <HStack spacing={0} h="10px" borderRadius="full" overflow="hidden" mb={2}>
                  <Box w={`${Math.min((totalEMI / monthIncome) * 100, 100)}%`} bg="red.400" />
                  <Box w={`${Math.max(Math.min((savingsTarget / monthIncome) * 100, 100 - (totalEMI/monthIncome)*100), 0)}%`} bg="purple.400" />
                  <Box flex="1" bg="green.200" _dark={{ bg: 'green.700' }} />
                </HStack>
                <HStack spacing={4} fontSize="10px" color={dimText}>
                  <HStack spacing={1}><Box w="8px" h="8px" borderRadius="full" bg="red.400" /><Text>EMIs {Math.round((totalEMI/monthIncome)*100)}%</Text></HStack>
                  <HStack spacing={1}><Box w="8px" h="8px" borderRadius="full" bg="purple.400" /><Text>Savings 20%</Text></HStack>
                  <HStack spacing={1}><Box w="8px" h="8px" borderRadius="full" bg="green.300" /><Text>Free cash</Text></HStack>
                </HStack>
              </Box>
            )}

            {/* Loan closure priority table */}
            {activeLoans.length > 0 && (
              <Box mt={5}>
                <Text fontSize="xs" fontWeight="semibold" color={dimText} mb={2} textTransform="uppercase" letterSpacing="wide">
                  Loan Closure Priority (highest interest first)
                </Text>
                <VStack spacing={2} align="stretch">
                  {[...activeLoans].sort((a, b) => b.interest_rate - a.interest_rate).map((loan, idx) => {
                    const monthsLeft = loan.emi_amount > 0
                      ? Math.ceil(loan.outstanding_balance / loan.emi_amount) : loan.remaining_tenure;
                    return (
                      <HStack key={loan.id} p={3}
                        bg={idx === 0 ? 'orange.50' : 'gray.50'}
                        _dark={{ bg: idx === 0 ? 'orange.900' : 'gray.700' }}
                        borderRadius="lg" justify="space-between" flexWrap="wrap" gap={2}>
                        <HStack spacing={2}>
                          <Badge colorScheme={idx === 0 ? 'orange' : 'gray'} fontSize="10px">#{idx + 1}</Badge>
                          <Box>
                            <Text fontSize="xs" fontWeight="semibold">{loan.bank_name} — {loan.loan_type}</Text>
                            <Text fontSize="10px" color={dimText}>EMI {formatINR(loan.emi_amount)} · ~{monthsLeft}m remaining</Text>
                          </Box>
                        </HStack>
                        <HStack spacing={4}>
                          <Box textAlign="right">
                            <Text fontSize="xs" fontWeight="bold" color="red.500">{formatINR(loan.outstanding_balance)}</Text>
                            <Text fontSize="10px" color="orange.500">{loan.interest_rate}% p.a.</Text>
                          </Box>
                        </HStack>
                      </HStack>
                    );
                  })}
                  <Box p={3} bg="blue.50" _dark={{ bg: 'blue.900' }} borderRadius="lg">
                    <Text fontSize="xs" color="blue.700" _dark={{ color: 'blue.200' }}>
                      💡 Paying off <strong>{priorityLoan?.bank_name}</strong> first saves the most interest.
                      Total outstanding: <strong>{formatINR(totalOutstanding)}</strong> across {activeLoans.length} loans.
                    </Text>
                  </Box>
                </VStack>
              </Box>
            )}
          </GlassCard>
        )}

        {/* ── Main 3-col layout ── */}
        <SimpleGrid columns={{ base: 1, xl: 5 }} spacing={5}>

          {/* Left — 3 cols */}
          <Box gridColumn={{ xl: 'span 3' }}>
            <VStack align="stretch" spacing={5}>

              {/* Income + Expense summary cards */}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>

                {/* Income breakdown */}
                <GlassCard p={5} noHover>
                  <SectionHeader title={`Income — ${currentMonthName}`} to="/income" />
                  {incomeQ.isLoading ? (
                    <Spinner size="sm" color="green.500" />
                  ) : incomes.length > 0 ? (
                    <VStack spacing={3} align="stretch">
                      {incomeSources.map((src, i) => (
                        <Box key={src.label}>
                          <HStack justify="space-between" mb={1}>
                            <HStack spacing={2}>
                              <Badge colorScheme={SRC_COLOR[src.label] ?? 'gray'} fontSize="9px" variant="subtle">{src.label}</Badge>
                            </HStack>
                            <Text fontSize="sm" fontWeight="semibold" color="green.500">{formatINR(src.amount)}</Text>
                          </HStack>
                          <Progress value={monthIncome > 0 ? (src.amount / monthIncome) * 100 : 0}
                            size="xs" colorScheme="green" borderRadius="full" />
                        </Box>
                      ))}
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontSize="xs" color={dimText}>Total</Text>
                        <Text fontSize="sm" fontWeight="bold" color="green.600">{formatINR(monthIncome)}</Text>
                      </HStack>
                      {/* Deductions if salary */}
                      {incomes.some(i => i.deductions && i.deductions.length > 0) && (
                        <Box bg="orange.50" _dark={{ bg: 'orange.900' }} p={3} borderRadius="lg">
                          <Text fontSize="xs" fontWeight="semibold" color="orange.700" mb={2}>🔻 Deductions</Text>
                          {incomes.filter(i => i.deductions?.length).flatMap(i => i.deductions ?? []).map((d, di) => (
                            <HStack key={di} justify="space-between" fontSize="xs">
                              <Text color="gray.600">{d.label}</Text>
                              <Text color="orange.600">− {formatINR(d.amount_paise)}</Text>
                            </HStack>
                          ))}
                          <Divider my={1} borderColor="orange.200" />
                          <HStack justify="space-between" fontSize="xs" fontWeight="bold">
                            <Text>Gross Pay</Text>
                            <Text color="green.600">{formatINR(incomes.find(i => i.gross_pay_paise)?.gross_pay_paise ?? 0)}</Text>
                          </HStack>
                        </Box>
                      )}
                    </VStack>
                  ) : (
                    <Text fontSize="sm" color={dimText}>No income this month.{' '}
                      <ChakraLink as={Link} to="/income" color="green.500">Upload salary slip →</ChakraLink>
                    </Text>
                  )}
                </GlassCard>

                {/* Expense category breakdown */}
                <GlassCard p={5} noHover>
                  <SectionHeader title={`Expenses — ${currentMonthName}`} to="/expenses" />
                  {expQ.isLoading ? (
                    <Spinner size="sm" color="red.500" />
                  ) : expCats.length > 0 ? (
                    <VStack spacing={2} align="stretch">
                      <ResponsiveContainer width="100%" height={130}>
                        <PieChart>
                          <Pie data={expCats} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={25}>
                            {expCats.map((c, i) => <Cell key={i} fill={c.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <RechartsTip formatter={(v: number) => formatINR(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      {expCats.map((cat, i) => (
                        <HStack key={cat.name} justify="space-between">
                          <HStack spacing={1.5}>
                            <Box w="8px" h="8px" borderRadius="full" bg={cat.color || PIE_COLORS[i % PIE_COLORS.length]} />
                            <Text fontSize="xs">{cat.icon} {cat.name}</Text>
                          </HStack>
                          <Text fontSize="xs" fontWeight="semibold">{formatINR(cat.amount)}</Text>
                        </HStack>
                      ))}
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontSize="xs" color={dimText}>Total</Text>
                        <Text fontSize="sm" fontWeight="bold" color="red.500">{formatINR(expTotal)}</Text>
                      </HStack>
                    </VStack>
                  ) : (
                    <Text fontSize="sm" color={dimText}>No expenses this month.{' '}
                      <ChakraLink as={Link} to="/expenses" color="purple.500">Log one →</ChakraLink>
                    </Text>
                  )}
                </GlassCard>
              </SimpleGrid>

              {/* Cash flow chart */}
              {last6.length > 0 && (
                <GlassCard p={5} noHover>
                  <SectionHeader title={`Cash Flow — ${curYear}`} to="/reports" />
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={last6} margin={{ left: -15 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke={useColorModeValue('#e2e8f0','#4a5568')} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(0, 3)} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v/100000).toFixed(0)}L`} />
                      <RechartsTip formatter={(v: number, n: string) => [formatINR(v), n.charAt(0).toUpperCase()+n.slice(1)]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="income"  name="income"  fill="#48bb78" radius={[3,3,0,0]} />
                      <Bar dataKey="expense" name="expense" fill="#f56565" radius={[3,3,0,0]} />
                      <Bar dataKey="savings" name="savings" fill="#805ad5" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <HStack spacing={4} mt={1} justify="center">
                    {[{c:'#48bb78',l:'Income'},{c:'#f56565',l:'Expense'},{c:'#805ad5',l:'Savings'}].map(x=>(
                      <HStack key={x.l} spacing={1}>
                        <Box w="8px" h="8px" borderRadius="full" bg={x.c} />
                        <Text fontSize="10px" color={dimText}>{x.l}</Text>
                      </HStack>
                    ))}
                  </HStack>
                </GlassCard>
              )}

              {/* Recent transactions */}
              <GlassCard p={5} noHover>
                <SectionHeader title="Recent Transactions" to="/expenses" />
                {expQ.isLoading ? (
                  <Spinner size="sm" color="purple.500" />
                ) : recentExpenses.length > 0 ? (
                  <TableContainer>
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th fontSize="10px">Date</Th>
                          <Th fontSize="10px">Description</Th>
                          <Th fontSize="10px">Category</Th>
                          <Th fontSize="10px" isNumeric>Amount</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {recentExpenses.map(e => (
                          <Tr key={e.id}>
                            <Td fontSize="11px" color={dimText} whiteSpace="nowrap">
                              {new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </Td>
                            <Td fontSize="xs" maxW="180px">
                              <Text isTruncated>{e.description ?? '—'}</Text>
                            </Td>
                            <Td>
                              <Badge fontSize="9px" variant="subtle"
                                style={{ background: (e.category?.color ?? '#718096') + '22', color: e.category?.color ?? '#718096' }}>
                                {e.category?.icon} {e.category?.name}
                              </Badge>
                            </Td>
                            <Td isNumeric fontSize="xs" fontWeight="semibold" color="red.400">
                              {formatINR(e.amount)}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Text fontSize="sm" color={dimText}>No recent transactions.</Text>
                )}
              </GlassCard>

              {/* Accounts + Loans */}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {/* Accounts */}
                <GlassCard p={5} noHover>
                  <SectionHeader title="Accounts" to="/accounts" />
                  {accsQ.isLoading ? <Spinner size="sm" /> : accounts.length > 0 ? (
                    <VStack spacing={2} align="stretch">
                      {accounts.map(acc => (
                        <HStack key={acc.id} justify="space-between" py={1}>
                          <HStack spacing={2}>
                            <Text fontSize="md">{ACC_ICON[acc.account_type] ?? '🏦'}</Text>
                            <Box>
                              <Text fontSize="xs" fontWeight="medium" noOfLines={1}>{acc.name}</Text>
                              <Text fontSize="10px" color={dimText}>{acc.bank_name ?? acc.account_type}</Text>
                            </Box>
                          </HStack>
                          <Text fontSize="sm" fontWeight="semibold" color={acc.balance >= 0 ? 'green.500' : 'red.500'}>
                            {formatINR(acc.balance)}
                          </Text>
                        </HStack>
                      ))}
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontSize="xs" color={dimText}>Liquid total</Text>
                        <Text fontSize="sm" fontWeight="bold" color="green.600">{formatINR(liquidTotal)}</Text>
                      </HStack>
                    </VStack>
                  ) : (
                    <Text fontSize="sm" color={dimText}>No accounts yet.</Text>
                  )}
                </GlassCard>

                {/* Active loans */}
                <GlassCard p={5} noHover>
                  <SectionHeader title="Active Loans" to="/loans" />
                  {loansQ.isLoading ? <Spinner size="sm" /> : activeLoans.length > 0 ? (
                    <VStack spacing={3} align="stretch">
                      {activeLoans.slice(0, 3).map(loan => {
                        const pct = loan.loan_amount > 0
                          ? Math.round((loan.loan_amount - loan.outstanding_balance) / loan.loan_amount * 100) : 0;
                        return (
                          <Box key={loan.id}>
                            <HStack justify="space-between" mb={1}>
                              <HStack spacing={1.5}>
                                <Text fontSize="sm">{LOAN_ICON[loan.loan_type] ?? '🏦'}</Text>
                                <Box>
                                  <Text fontSize="xs" fontWeight="medium">{loan.bank_name}</Text>
                                  <Text fontSize="10px" color={dimText}>{loan.loan_type} · {loan.remaining_tenure}m left</Text>
                                </Box>
                              </HStack>
                              <Box textAlign="right">
                                <Text fontSize="xs" fontWeight="semibold" color="red.500">{formatINR(loan.outstanding_balance)}</Text>
                                <Text fontSize="10px" color={dimText}>EMI {formatINR(loan.emi_amount)}</Text>
                              </Box>
                            </HStack>
                            <Progress value={pct} size="xs" colorScheme="green" borderRadius="full" />
                            <Text fontSize="9px" color={dimText} mt={0.5}>{pct}% repaid</Text>
                          </Box>
                        );
                      })}
                      <Divider />
                      <HStack justify="space-between">
                        <Text fontSize="xs" color={dimText}>Total outstanding</Text>
                        <Text fontSize="sm" fontWeight="bold" color="red.500">
                          {formatINR(activeLoans.reduce((s, l) => s + l.outstanding_balance, 0))}
                        </Text>
                      </HStack>
                    </VStack>
                  ) : (
                    <Text fontSize="sm" color={dimText}>No active loans.</Text>
                  )}
                </GlassCard>
              </SimpleGrid>

            </VStack>
          </Box>

          {/* Right — 2 cols */}
          <Box gridColumn={{ xl: 'span 2' }}>
            <VStack align="stretch" spacing={5}>

              {/* Budgets */}
              <GlassCard p={5} noHover>
                <SectionHeader title={`Budgets — ${currentMonthName}`} to="/budgets" />
                {budgetsQ.isLoading ? <Spinner size="sm" /> : budgets.length > 0 ? (
                  <VStack spacing={3} align="stretch">
                    {budgets.slice(0, 5).map(b => {
                      const pct  = b.limit_amount > 0 ? Math.round((b.spent_amount / b.limit_amount) * 100) : 0;
                      const over = pct > 100;
                      return (
                        <Box key={b.id}>
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="xs">{b.category_icon} {b.category_name}</Text>
                            <HStack spacing={1}>
                              <Text fontSize="10px" color={over ? 'red.500' : dimText}>{formatINR(b.spent_amount)}</Text>
                              <Text fontSize="10px" color={dimText}>/ {formatINR(b.limit_amount)}</Text>
                            </HStack>
                          </HStack>
                          <Progress value={Math.min(pct, 100)} size="xs" borderRadius="full"
                            colorScheme={over ? 'red' : pct >= 80 ? 'orange' : 'green'} />
                          {over && <Text fontSize="9px" color="red.500" mt={0.5}>Over budget by {formatINR(b.spent_amount - b.limit_amount)}</Text>}
                        </Box>
                      );
                    })}
                  </VStack>
                ) : (
                  <Text fontSize="sm" color={dimText}>No budgets set.{' '}
                    <ChakraLink as={Link} to="/budgets" color="purple.500">Create one →</ChakraLink>
                  </Text>
                )}
              </GlassCard>

              {/* Goals */}
              <GlassCard p={5} noHover>
                <SectionHeader title="Goals" to="/goals" />
                {goalsQ.isLoading ? <Spinner size="sm" /> : goals.length > 0 ? (
                  <VStack spacing={3} align="stretch">
                    {goals.map(g => {
                      const pct = g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
                      const remaining = g.target_amount - g.current_amount;
                      return (
                        <Box key={g.id}>
                          <HStack justify="space-between" mb={1}>
                            <HStack spacing={1.5}>
                              <Text fontSize="sm">{g.icon}</Text>
                              <Text fontSize="xs" fontWeight="medium" noOfLines={1}>{g.name}</Text>
                            </HStack>
                            <Text fontSize="10px" color={dimText}>{pct}%</Text>
                          </HStack>
                          <Progress value={pct} size="xs" colorScheme="purple" borderRadius="full" />
                          <HStack justify="space-between" mt={0.5}>
                            <Text fontSize="9px" color={dimText}>{formatINR(g.current_amount)} saved</Text>
                            <Text fontSize="9px" color={dimText}>{formatINR(remaining)} to go</Text>
                          </HStack>
                        </Box>
                      );
                    })}
                  </VStack>
                ) : (
                  <Text fontSize="sm" color={dimText}>No goals yet.{' '}
                    <ChakraLink as={Link} to="/goals" color="purple.500">Set one →</ChakraLink>
                  </Text>
                )}
              </GlassCard>

              {/* Investments */}
              <GlassCard p={5} noHover>
                <SectionHeader title="Investments" to="/investments" />
                {invQ.isLoading ? <Spinner size="sm" /> : investments.length > 0 ? (
                  <VStack spacing={2} align="stretch">
                    {investments.slice(0, 5).map(inv => {
                      const gain = inv.current_value - inv.invested_amount;
                      const gainPct = inv.invested_amount > 0 ? ((gain / inv.invested_amount) * 100).toFixed(1) : '0';
                      return (
                        <HStack key={inv.id} justify="space-between" py={1}>
                          <HStack spacing={2}>
                            <Text fontSize="md">{INV_ICON[inv.investment_type] ?? '💼'}</Text>
                            <Box>
                              <Text fontSize="xs" fontWeight="medium" noOfLines={1}>{inv.name}</Text>
                              <Text fontSize="10px" color={dimText} textTransform="capitalize">{inv.investment_type.replace('_',' ')}</Text>
                            </Box>
                          </HStack>
                          <Box textAlign="right">
                            <Text fontSize="xs" fontWeight="semibold">{formatINR(inv.current_value)}</Text>
                            <Text fontSize="10px" color={gain >= 0 ? 'green.500' : 'red.500'}>
                              {gain >= 0 ? '+' : ''}{gainPct}%
                            </Text>
                          </Box>
                        </HStack>
                      );
                    })}
                    <Divider />
                    <HStack justify="space-between">
                      <Text fontSize="xs" color={dimText}>Portfolio value</Text>
                      <Text fontSize="sm" fontWeight="bold" color="teal.500">{formatINR(invTotal)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color={dimText}>Total gain/loss</Text>
                      <Text fontSize="sm" fontWeight="bold" color={invGain >= 0 ? 'green.500' : 'red.500'}>
                        {invGain >= 0 ? '+' : ''}{formatINR(invGain)}
                      </Text>
                    </HStack>
                  </VStack>
                ) : (
                  <Text fontSize="sm" color={dimText}>No investments.{' '}
                    <ChakraLink as={Link} to="/investments" color="purple.500">Add one →</ChakraLink>
                  </Text>
                )}
              </GlassCard>

              {/* Health score */}
              {healthScore && (
                <GlassCard p={5} noHover>
                  <SectionHeader title="Health Score" to="/health-score" />
                  <HStack mb={3} spacing={3}>
                    <CircularProgress value={healthScore.score} max={100}
                      color={`${scoreColor}.400`} size="52px" thickness="10px">
                      <CircularProgressLabel>
                        <Text fontSize="md" fontWeight="black">{healthScore.score}</Text>
                      </CircularProgressLabel>
                    </CircularProgress>
                    <Box>
                      <Badge colorScheme={scoreColor} fontSize="10px">{scoreRating.toUpperCase()}</Badge>
                      <Text fontSize="10px" color={dimText} mt={0.5}>out of 100</Text>
                    </Box>
                  </HStack>
                  <VStack spacing={2} align="stretch">
                    {[
                      { label: 'Savings',     v: healthScore.savings_ratio_score,      max: 20 },
                      { label: 'Debt',        v: healthScore.debt_ratio_score,         max: 20 },
                      { label: 'Emergency',   v: healthScore.emergency_fund_score,     max: 20 },
                      { label: 'Investments', v: healthScore.investment_ratio_score,   max: 20 },
                      { label: 'Insurance',   v: healthScore.insurance_score,          max: 10 },
                      { label: 'Credit',      v: healthScore.credit_utilization_score, max: 10 },
                    ].map(c => (
                      <Box key={c.label}>
                        <HStack justify="space-between" mb={0.5}>
                          <Text fontSize="10px" color={dimText}>{c.label}</Text>
                          <Text fontSize="10px" fontWeight="semibold">{c.v}/{c.max}</Text>
                        </HStack>
                        <Progress value={(c.v / c.max) * 100} size="xs" borderRadius="full"
                          colorScheme={c.v/c.max >= 0.8 ? 'green' : c.v/c.max >= 0.5 ? 'yellow' : 'red'} />
                      </Box>
                    ))}
                  </VStack>
                </GlassCard>
              )}

            </VStack>
          </Box>
        </SimpleGrid>

        {/* ── Quick actions ── */}
        <GlassCard p={4} noHover>
          <Text fontSize="xs" color={dimText} fontWeight="semibold" mb={3} textTransform="uppercase" letterSpacing="wide">Quick Actions</Text>
          <SimpleGrid columns={{ base: 3, md: 6 }} spacing={2}>
            {[
              { icon: '💸', label: 'Log Expense',  to: '/expenses'    },
              { icon: '📄', label: 'Add Income',   to: '/income'      },
              { icon: '🎯', label: 'Goals',        to: '/goals'       },
              { icon: '📈', label: 'Investments',  to: '/investments' },
              { icon: '📑', label: 'Reports',      to: '/reports'     },
              { icon: '🤖', label: 'AI Advisor',   to: '/ai-advisor'  },
            ].map(q => (
              <ChakraLink key={q.to} as={Link} to={q.to} _hover={{ textDecor: 'none' }}>
                <Box p={3} borderRadius="xl" textAlign="center" cursor="pointer"
                  bg={useColorModeValue('gray.50','gray.700')}
                  _hover={{ bg: useColorModeValue('purple.50','purple.900'), transform: 'translateY(-2px)' }}
                  transition="all 0.15s">
                  <Text fontSize="xl">{q.icon}</Text>
                  <Text fontSize="10px" color={dimText} mt={1}>{q.label}</Text>
                </Box>
              </ChakraLink>
            ))}
          </SimpleGrid>
        </GlassCard>

      </VStack>
    </PageWrapper>
  );
}
