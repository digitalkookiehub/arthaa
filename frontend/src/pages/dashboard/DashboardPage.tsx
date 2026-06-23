import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Badge, Progress,
  Spinner, Flex, Avatar, Divider, CircularProgress, CircularProgressLabel,
  useColorModeValue, Link as ChakraLink, Stat, StatLabel, StatNumber, StatHelpText,
} from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../context/AuthContext';
import { formatINR, getScoreColor } from '../../lib/utils';
import api from '../../services/api';
import type { NetWorthSnapshot, FinancialHealthScore, Loan, Account } from '../../types';

// ── types ─────────────────────────────────────────────────────────────────────

interface CashFlowRow { month: string; income: number; expense: number; savings: number; savings_rate: number }
interface CashFlowData { rows: CashFlowRow[]; total_income: number; total_expense: number; savings_rate: number }
interface CategoryRow  { category: string; icon: string; color: string; amount: number; pct: number }
interface ExpenseData  { total: number; by_category: CategoryRow[] }
interface CalEvent     { date: string; type: string; icon: string; color: string; title: string; subtitle: string; amount_str: string; days_away: number; urgency: string; is_overdue: boolean }
interface Rec          { priority: 'high'|'medium'|'low'; icon: string; title: string; body: string }

// ── helpers ───────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function currentMonthRange(): [string, string] {
  const n    = new Date();
  const from = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  const to   = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return [from, to];
}

const URGENCY_COLOR: Record<string, string> = { overdue: 'red', critical: 'red', urgent: 'orange', soon: 'yellow', upcoming: 'gray' };
const LOAN_TYPE_ICON: Record<string, string> = { home: '🏠', personal: '👤', gold: '🥇', car: '🚗', education: '🎓', credit_card: '💳', other: '🏦' };
const ACC_TYPE_ICON:  Record<string, string> = { bank: '🏦', cash: '💵', wallet: '👛', upi: '📱' };
const PIE_COLORS = ['#805ad5','#e53e3e','#3182ce','#38a169','#d69e2e','#dd6b20','#319795','#718096'];

function dayLabel(d: number): string {
  if (d < 0)  return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `In ${d} days`;
}

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
  const [expFrom, expTo] = useMemo(currentMonthRange, []);
  const curYear = new Date().getFullYear();

  // ── parallel queries ──────────────────────────────────────────────────────

  const nwQ  = useQuery<NetWorthSnapshot>({
    queryKey: ['net-worth-latest'],
    queryFn:  () => api.get('/net-worth/latest').then(r => r.data),
    retry: false,
  });
  const hsQ  = useQuery<FinancialHealthScore>({
    queryKey: ['health-score-latest'],
    queryFn:  () => api.get('/health-score/latest').then(r => r.data),
    retry: false,
  });
  const cfQ  = useQuery<CashFlowData>({
    queryKey: ['dash-cashflow', curYear],
    queryFn:  () => api.get('/reports/cash-flow', { params: { year: curYear, fiscal: false } }).then(r => r.data),
  });
  const expQ = useQuery<ExpenseData>({
    queryKey: ['dash-expense', expFrom, expTo],
    queryFn:  () => api.get('/reports/expenses', { params: { from_date: expFrom, to_date: expTo } }).then(r => r.data),
  });
  const calQ = useQuery<{ events: CalEvent[] }>({
    queryKey: ['calendar-upcoming-dash'],
    queryFn:  () => api.get('/calendar/upcoming', { params: { days: 7 } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });
  const recQ = useQuery<{ recommendations: Rec[] }>({
    queryKey: ['ai-recommendations'],
    queryFn:  () => api.get('/ai/recommendations').then(r => r.data),
    staleTime: 1000 * 60 * 30,
  });
  const loansQ = useQuery<{ data: Loan[] }>({
    queryKey: ['dash-loans'],
    queryFn:  () => api.get('/loans', { params: { page: 1, limit: 4 } }).then(r => r.data),
  });
  const accsQ = useQuery<{ data: Account[] }>({
    queryKey: ['dash-accounts'],
    queryFn:  () => api.get('/accounts', { params: { page: 1, limit: 10 } }).then(r => r.data),
  });

  // ── derived values ────────────────────────────────────────────────────────

  // Current month row from cash flow
  const currentMonthName = new Date().toLocaleString('en-IN', { month: 'long' });
  const cfRows   = cfQ.data?.rows ?? [];
  const curMonth = cfRows.find(r => r.month === currentMonthName) ?? cfRows[cfRows.length - 1];
  const last6    = cfRows.slice(-6);

  const netWorth     = nwQ.data;
  const healthScore  = hsQ.data;
  const monthIncome  = curMonth?.income  ?? 0;
  const monthExpense = curMonth?.expense ?? 0;
  const savingsRate  = curMonth?.savings_rate ?? 0;

  const upcomingEvts = calQ.data?.events ?? [];
  const overdueEvts  = upcomingEvts.filter(e => e.is_overdue);
  const urgentEvts   = upcomingEvts.filter(e => !e.is_overdue && ['critical','urgent'].includes(e.urgency));

  const topRecs = (recQ.data?.recommendations ?? []).filter(r => r.priority === 'high').slice(0, 2);
  const allRecs = topRecs.length ? topRecs : (recQ.data?.recommendations ?? []).slice(0, 2);

  const activeLoans = (loansQ.data?.data ?? []).filter(l => l.outstanding_balance > 0);
  const accounts    = accsQ.data?.data ?? [];
  const liquidTotal = accounts.reduce((s, a) => s + a.balance, 0);

  const expCats = (expQ.data?.by_category ?? []).slice(0, 5);

  const scoreColor = healthScore ? getScoreColor(healthScore.score) : 'gray';
  const scoreRating = healthScore?.rating ?? '';

  const cardBg  = useColorModeValue('white', 'gray.800');
  const dimText = useColorModeValue('gray.500', 'gray.400');

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
              <Avatar
                size="md" name={user?.full_name ?? 'U'}
                bg="whiteAlpha.300" color="white" fontWeight="bold"
              />
              <Box>
                <Text fontSize="xs" color="whiteAlpha.700">{todayStr}</Text>
                <Heading size="md" color="white">{greeting()}, {firstName} 👋</Heading>
                <Text fontSize="sm" color="whiteAlpha.800">Here's your financial overview</Text>
              </Box>
            </HStack>
            {healthScore && (
              <Box textAlign="center">
                <CircularProgress
                  value={healthScore.score} max={100}
                  color={`${scoreColor}.300`} trackColor="whiteAlpha.200"
                  size="70px" thickness="8px"
                >
                  <CircularProgressLabel>
                    <Text fontSize="lg" fontWeight="black" color="white">{healthScore.score}</Text>
                  </CircularProgressLabel>
                </CircularProgress>
                <Text fontSize="10px" color="whiteAlpha.700" mt={1} textTransform="capitalize">
                  {scoreRating} health
                </Text>
              </Box>
            )}
          </HStack>
        </GlassCard>

        {/* ── Alert strip ── */}
        {(overdueEvts.length > 0 || urgentEvts.length > 0) && (
          <Box
            bg={overdueEvts.length ? 'red.50' : 'orange.50'}
            _dark={{ bg: overdueEvts.length ? 'red.900' : 'orange.900' }}
            border="1px solid"
            borderColor={overdueEvts.length ? 'red.200' : 'orange.200'}
            borderRadius="xl" px={4} py={3}
          >
            <HStack spacing={3} flexWrap="wrap" gap={2}>
              <Text fontSize="sm">{overdueEvts.length ? '🚨' : '⚠️'}</Text>
              <Text fontSize="sm" fontWeight="semibold" color={overdueEvts.length ? 'red.700' : 'orange.700'} _dark={{ color: overdueEvts.length ? 'red.200' : 'orange.200' }}>
                {overdueEvts.length > 0
                  ? `${overdueEvts.length} overdue payment${overdueEvts.length > 1 ? 's' : ''}`
                  : `${urgentEvts.length} payment${urgentEvts.length > 1 ? 's' : ''} due very soon`}
              </Text>
              {(overdueEvts.length ? overdueEvts : urgentEvts).slice(0, 2).map((e, i) => (
                <Badge key={i} colorScheme={overdueEvts.length ? 'red' : 'orange'} fontSize="10px" variant="subtle">
                  {e.icon} {e.title.split('—')[0].trim().slice(0, 24)}
                </Badge>
              ))}
              <ChakraLink as={Link} to="/calendar" fontSize="xs" color="purple.500" ml="auto">View calendar →</ChakraLink>
            </HStack>
          </Box>
        )}

        {/* ── KPI row ── */}
        <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} spacing={3}>
          <KpiCard
            label="Net Worth"
            value={netWorth ? formatINR(netWorth.net_worth) : '—'}
            sub="Assets − Liabilities"
            color={netWorth && netWorth.net_worth >= 0 ? 'purple.600' : 'red.500'}
            isLoading={nwQ.isLoading}
            to="/net-worth"
          />
          <KpiCard
            label="This Month Income"
            value={cfQ.isLoading ? '…' : formatINR(monthIncome)}
            sub={currentMonthName}
            color="green.500"
            isLoading={cfQ.isLoading}
            to="/income"
          />
          <KpiCard
            label="This Month Expense"
            value={cfQ.isLoading ? '…' : formatINR(monthExpense)}
            sub={currentMonthName}
            color="red.500"
            isLoading={cfQ.isLoading}
            to="/expenses"
          />
          <KpiCard
            label="Savings Rate"
            value={cfQ.isLoading ? '…' : `${savingsRate}%`}
            sub={savingsRate >= 20 ? 'On track ✓' : 'Below 20% target'}
            color={savingsRate >= 20 ? 'green.500' : savingsRate >= 10 ? 'orange.500' : 'red.500'}
            isLoading={cfQ.isLoading}
            to="/reports"
          />
          <KpiCard
            label="Health Score"
            value={healthScore ? `${healthScore.score}/100` : '—'}
            sub={scoreRating ? scoreRating.charAt(0).toUpperCase() + scoreRating.slice(1) : 'Calculate now'}
            color={`${scoreColor}.500`}
            isLoading={hsQ.isLoading}
            to="/health-score"
          />
        </SimpleGrid>

        {/* ── Main content ── */}
        <SimpleGrid columns={{ base: 1, xl: 5 }} spacing={5}>

          {/* Left column (3/5) */}
          <Box gridColumn={{ xl: 'span 3' }}>
            <VStack align="stretch" spacing={5}>

              {/* Cash flow bar chart */}
              <GlassCard p={5} noHover>
                <SectionHeader title={`Cash Flow — ${curYear}`} to="/reports" />
                {cfQ.isLoading ? (
                  <Box textAlign="center" py={6}><Spinner color="purple.500" /></Box>
                ) : last6.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={last6} margin={{ left: -15, bottom: 0 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke={useColorModeValue('#e2e8f0','#4a5568')} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(0, 3)} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v/100000).toFixed(0)}L`} />
                      <RechartsTip
                        formatter={(v: number, name: string) => [formatINR(v), name.charAt(0).toUpperCase() + name.slice(1)]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Bar dataKey="income"  name="income"  fill="#48bb78" radius={[3,3,0,0]} />
                      <Bar dataKey="expense" name="expense" fill="#f56565" radius={[3,3,0,0]} />
                      <Bar dataKey="savings" name="savings" fill="#805ad5" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Text fontSize="sm" color={dimText} textAlign="center" py={6}>
                    No income/expense data yet. <ChakraLink as={Link} to="/income" color="purple.500">Add income</ChakraLink> or <ChakraLink as={Link} to="/expenses" color="purple.500">log expenses</ChakraLink>.
                  </Text>
                )}
                <HStack spacing={4} mt={2} justify="center">
                  {[{color:'#48bb78',l:'Income'},{color:'#f56565',l:'Expense'},{color:'#805ad5',l:'Savings'}].map(i=>(
                    <HStack key={i.l} spacing={1}>
                      <Box w="8px" h="8px" borderRadius="full" bg={i.color} />
                      <Text fontSize="10px" color={dimText}>{i.l}</Text>
                    </HStack>
                  ))}
                </HStack>
              </GlassCard>

              {/* Expense breakdown */}
              <GlassCard p={5} noHover>
                <SectionHeader title={`Expenses — ${currentMonthName}`} to="/expenses" />
                {expQ.isLoading ? (
                  <Box textAlign="center" py={4}><Spinner size="sm" color="purple.500" /></Box>
                ) : expCats.length > 0 ? (
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} alignItems="center">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={expCats} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                          {expCats.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <RechartsTip formatter={(v: number) => formatINR(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <VStack spacing={2} align="stretch">
                      {expCats.map((cat, i) => (
                        <Box key={cat.category}>
                          <HStack justify="space-between" mb={0.5}>
                            <HStack spacing={1.5}>
                              <Box w="8px" h="8px" borderRadius="full" bg={PIE_COLORS[i % PIE_COLORS.length]} />
                              <Text fontSize="xs">{cat.icon} {cat.category}</Text>
                            </HStack>
                            <Text fontSize="xs" fontWeight="semibold">{cat.pct}%</Text>
                          </HStack>
                          <Progress value={cat.pct} size="xs" colorScheme="purple" borderRadius="full"
                            sx={{ '& > div': { background: PIE_COLORS[i % PIE_COLORS.length] } }} />
                        </Box>
                      ))}
                      {expQ.data && (
                        <Text fontSize="xs" color={dimText} mt={1}>
                          Total: <strong>{formatINR(expQ.data.total)}</strong>
                        </Text>
                      )}
                    </VStack>
                  </SimpleGrid>
                ) : (
                  <Text fontSize="sm" color={dimText} textAlign="center" py={4}>
                    No expenses this month. <ChakraLink as={Link} to="/expenses" color="purple.500">Log one →</ChakraLink>
                  </Text>
                )}
              </GlassCard>

              {/* Accounts + Loans */}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>

                {/* Bank accounts */}
                <GlassCard p={5} noHover>
                  <SectionHeader title="Accounts" to="/accounts" />
                  {accsQ.isLoading ? (
                    <Spinner size="sm" color="purple.500" />
                  ) : accounts.length > 0 ? (
                    <VStack spacing={2} align="stretch">
                      {accounts.slice(0, 4).map(acc => (
                        <HStack key={acc.id} justify="space-between" py={1}>
                          <HStack spacing={2}>
                            <Text fontSize="md">{ACC_TYPE_ICON[acc.account_type] ?? '🏦'}</Text>
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
                    <Text fontSize="sm" color={dimText}>No accounts yet. <ChakraLink as={Link} to="/accounts" color="purple.500">Add one →</ChakraLink></Text>
                  )}
                </GlassCard>

                {/* Active loans */}
                <GlassCard p={5} noHover>
                  <SectionHeader title="Active Loans" to="/loans" />
                  {loansQ.isLoading ? (
                    <Spinner size="sm" color="purple.500" />
                  ) : activeLoans.length > 0 ? (
                    <VStack spacing={3} align="stretch">
                      {activeLoans.slice(0, 3).map(loan => {
                        const paidPct = loan.loan_amount > 0
                          ? Math.round((loan.loan_amount - loan.outstanding_balance) / loan.loan_amount * 100)
                          : 0;
                        return (
                          <Box key={loan.id}>
                            <HStack justify="space-between" mb={1}>
                              <HStack spacing={1.5}>
                                <Text fontSize="sm">{LOAN_TYPE_ICON[loan.loan_type] ?? '🏦'}</Text>
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
                            <Progress value={paidPct} size="xs" colorScheme="green" borderRadius="full" />
                            <Text fontSize="9px" color={dimText} mt={0.5}>{paidPct}% repaid</Text>
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
                    <Text fontSize="sm" color={dimText}>No active loans. <ChakraLink as={Link} to="/loans" color="purple.500">Add one →</ChakraLink></Text>
                  )}
                </GlassCard>
              </SimpleGrid>

            </VStack>
          </Box>

          {/* Right column (2/5) */}
          <Box gridColumn={{ xl: 'span 2' }}>
            <VStack align="stretch" spacing={5}>

              {/* Upcoming events */}
              <GlassCard p={5} noHover>
                <SectionHeader title="Next 7 Days" to="/calendar" />
                {calQ.isLoading ? (
                  <Box textAlign="center" py={4}><Spinner size="sm" color="purple.500" /></Box>
                ) : upcomingEvts.length > 0 ? (
                  <VStack spacing={2} align="stretch">
                    {upcomingEvts.slice(0, 6).map((ev, i) => (
                      <Flex key={i} align="center" gap={3} py={1.5}
                        borderBottom="1px solid" borderColor={useColorModeValue('gray.50','gray.700')}>
                        <Box
                          w="36px" h="36px" borderRadius="lg" display="flex" alignItems="center"
                          justifyContent="center" fontSize="lg" flexShrink={0}
                          bg={useColorModeValue('gray.50','gray.700')}
                          border="2px solid" borderColor={ev.color}
                        >
                          {ev.icon}
                        </Box>
                        <Box flex="1" minW={0}>
                          <Text fontSize="xs" fontWeight="semibold" noOfLines={1}>{ev.title}</Text>
                          <HStack spacing={1}>
                            <Badge
                              colorScheme={URGENCY_COLOR[ev.urgency] ?? 'gray'}
                              fontSize="9px" variant={ev.is_overdue ? 'solid' : 'subtle'}
                            >
                              {dayLabel(ev.days_away)}
                            </Badge>
                            {ev.amount_str && <Text fontSize="10px" color={dimText}>{ev.amount_str}</Text>}
                          </HStack>
                        </Box>
                      </Flex>
                    ))}
                    {upcomingEvts.length > 6 && (
                      <ChakraLink as={Link} to="/calendar" fontSize="xs" color="purple.500" textAlign="center">
                        +{upcomingEvts.length - 6} more events
                      </ChakraLink>
                    )}
                  </VStack>
                ) : (
                  <Text fontSize="sm" color={dimText} textAlign="center" py={4}>
                    No events in the next 7 days 🎉
                  </Text>
                )}
              </GlassCard>

              {/* AI insights */}
              <GlassCard p={5} noHover>
                <SectionHeader title="AI Insights" to="/ai-advisor" />
                {recQ.isLoading ? (
                  <Spinner size="sm" color="purple.500" />
                ) : allRecs.length > 0 ? (
                  <VStack spacing={3} align="stretch">
                    {allRecs.map((rec, i) => (
                      <Box key={i}
                        p={3} borderRadius="lg"
                        bg={useColorModeValue(
                          rec.priority==='high' ? 'red.50' : rec.priority==='medium' ? 'orange.50' : 'green.50',
                          rec.priority==='high' ? 'red.900' : rec.priority==='medium' ? 'orange.900' : 'green.900'
                        )}
                        borderLeft="3px solid"
                        borderLeftColor={rec.priority==='high' ? 'red.400' : rec.priority==='medium' ? 'orange.400' : 'green.400'}
                      >
                        <HStack spacing={2} mb={1}>
                          <Text fontSize="md">{rec.icon}</Text>
                          <Text fontSize="xs" fontWeight="semibold" noOfLines={1}>{rec.title}</Text>
                        </HStack>
                        <Text fontSize="11px" color={dimText} noOfLines={2}>{rec.body}</Text>
                      </Box>
                    ))}
                    <ChakraLink as={Link} to="/ai-advisor" fontSize="xs" color="purple.500" textAlign="center">
                      Chat with AI advisor →
                    </ChakraLink>
                  </VStack>
                ) : (
                  <Box textAlign="center">
                    <Text fontSize="sm" color={dimText} mb={2}>No insights yet</Text>
                    <ChakraLink as={Link} to="/ai-advisor" fontSize="xs" color="purple.500">
                      Open AI Advisor →
                    </ChakraLink>
                  </Box>
                )}
              </GlassCard>

              {/* Health score breakdown */}
              {healthScore && (
                <GlassCard p={5} noHover>
                  <SectionHeader title="Health Score" to="/health-score" />
                  <HStack mb={3} spacing={3}>
                    <CircularProgress
                      value={healthScore.score} max={100}
                      color={`${scoreColor}.400`} size="52px" thickness="10px"
                    >
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
                      { label: 'Savings',      v: healthScore.savings_ratio_score,       max: 20 },
                      { label: 'Debt',         v: healthScore.debt_ratio_score,          max: 20 },
                      { label: 'Emergency',    v: healthScore.emergency_fund_score,      max: 20 },
                      { label: 'Investments',  v: healthScore.investment_ratio_score,    max: 20 },
                      { label: 'Insurance',    v: healthScore.insurance_score,           max: 10 },
                      { label: 'Credit',       v: healthScore.credit_utilization_score,  max: 10 },
                    ].map(c => (
                      <Box key={c.label}>
                        <HStack justify="space-between" mb={0.5}>
                          <Text fontSize="10px" color={dimText}>{c.label}</Text>
                          <Text fontSize="10px" fontWeight="semibold">{c.v}/{c.max}</Text>
                        </HStack>
                        <Progress
                          value={(c.v / c.max) * 100} size="xs" borderRadius="full"
                          colorScheme={c.v / c.max >= 0.8 ? 'green' : c.v / c.max >= 0.5 ? 'yellow' : 'red'}
                        />
                      </Box>
                    ))}
                  </VStack>
                </GlassCard>
              )}

            </VStack>
          </Box>
        </SimpleGrid>

        {/* ── Quick links footer ── */}
        <GlassCard p={4} noHover>
          <Text fontSize="xs" color={dimText} fontWeight="semibold" mb={3} textTransform="uppercase" letterSpacing="wide">Quick Actions</Text>
          <SimpleGrid columns={{ base: 3, md: 6 }} spacing={2}>
            {[
              { icon: '💸', label: 'Log Expense',  to: '/expenses'     },
              { icon: '💰', label: 'Add Income',   to: '/income'       },
              { icon: '🎯', label: 'Goals',        to: '/goals'        },
              { icon: '📈', label: 'Investments',  to: '/investments'  },
              { icon: '📑', label: 'Reports',      to: '/reports'      },
              { icon: '🤖', label: 'AI Advisor',   to: '/ai-advisor'   },
            ].map(q => (
              <ChakraLink key={q.to} as={Link} to={q.to} _hover={{ textDecor: 'none' }}>
                <Box
                  p={3} borderRadius="xl" textAlign="center" cursor="pointer"
                  bg={useColorModeValue('gray.50','gray.700')}
                  _hover={{ bg: useColorModeValue('purple.50','purple.900'), transform: 'translateY(-2px)' }}
                  transition="all 0.15s"
                >
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
