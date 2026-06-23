import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Badge, Button, Select, Input,
  Tabs, TabList, Tab, TabPanels, TabPanel, Stat, StatLabel, StatNumber,
  StatHelpText, StatArrow, Table, Thead, Tbody, Tr, Th, Td, TableContainer,
  Spinner, Divider, Progress,
} from '@chakra-ui/react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { formatINR } from '../../lib/utils';
import api from '../../services/api';

// ── helpers ───────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_FY   = new Date().getMonth() >= 3 ? CURRENT_YEAR : CURRENT_YEAR - 1;

function thisMonthRange(): [string, string] {
  const now   = new Date();
  const from  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const to    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${last}`;
  return [from, to];
}

const PIE_COLORS = [
  '#805ad5','#e53e3e','#3182ce','#38a169','#d69e2e',
  '#dd6b20','#319795','#00b5d8','#718096','#b7791f',
];

const PM_ICONS: Record<string, string> = {
  upi: '📱', card: '💳', cash: '💵', net_banking: '🏦', cheque: '📝',
};

// ── types ─────────────────────────────────────────────────────────────────────

interface CashFlowRow { month: string; income: number; expense: number; savings: number; savings_rate: number }
interface CashFlowData { rows: CashFlowRow[]; total_income: number; total_expense: number; total_savings: number; savings_rate: number; period_label: string }

interface CategoryRow { category: string; icon: string; color: string; amount: number; count: number; pct: number }
interface PaymentRow  { method: string; amount: number; pct: number }
interface DailyRow    { date: string; amount: number }
interface Top5Row     { date: string; description: string; category: string; icon: string; amount: number }
interface ExpenseData { total: number; by_category: CategoryRow[]; by_payment: PaymentRow[]; daily_trend: DailyRow[]; top5: Top5Row[]; from_date: string; to_date: string }

interface NetWorthSnap { date: string; total_assets: number; total_liabilities: number; net_worth: number }
interface NetWorthData { snapshots: NetWorthSnap[]; change: number; change_pct: number; latest: NetWorthSnap | null }

interface TaxData {
  period_label: string; gross_income: number; income_by_source: Record<string, number>;
  deductions: { standard: number; '80C': number; '80C_raw': number; '80C_limit': number; '80CCD_1B': number; total: number };
  investments_80c: Record<string, number>;
  taxable_income: number; estimated_tax: number; effective_rate: number;
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tabIdx, setTabIdx] = useState(0);

  // Cash Flow controls
  const [cfYear,   setCfYear]   = useState(CURRENT_FY);
  const [cfFiscal, setCfFiscal] = useState(true);

  // Expense breakdown controls
  const [expFrom, setExpFrom] = useState(thisMonthRange()[0]);
  const [expTo,   setExpTo]   = useState(thisMonthRange()[1]);

  // Net worth controls
  const [nwMonths, setNwMonths] = useState(12);

  // Tax controls
  const [taxFy, setTaxFy] = useState(CURRENT_FY);

  // ── queries ──

  const cfQuery = useQuery<CashFlowData>({
    queryKey: ['report-cashflow', cfYear, cfFiscal],
    queryFn:  () => api.get('/reports/cash-flow', { params: { year: cfYear, fiscal: cfFiscal } }).then(r => r.data),
    enabled:  tabIdx === 0,
  });

  const expQuery = useQuery<ExpenseData>({
    queryKey: ['report-expense', expFrom, expTo],
    queryFn:  () => api.get('/reports/expenses', { params: { from_date: expFrom, to_date: expTo } }).then(r => r.data),
    enabled:  tabIdx === 1 && !!expFrom && !!expTo,
  });

  const nwQuery = useQuery<NetWorthData>({
    queryKey: ['report-networth', nwMonths],
    queryFn:  () => api.get('/reports/net-worth-trend', { params: { months: nwMonths } }).then(r => r.data),
    enabled:  tabIdx === 2,
  });

  const taxQuery = useQuery<TaxData>({
    queryKey: ['report-tax', taxFy],
    queryFn:  () => api.get('/reports/tax', { params: { fy: taxFy } }).then(r => r.data),
    enabled:  tabIdx === 3,
  });

  const years = Array.from({ length: 5 }, (_, i) => CURRENT_FY - i);

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>

        {/* ── Header ── */}
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Reports</Heading>
            <Text color="gray.500" fontSize="sm">Analyse your financial data across time</Text>
          </Box>
          <Button size="sm" variant="outline" colorScheme="purple" onClick={() => window.print()}>
            🖨️ Print
          </Button>
        </HStack>

        {/* ── Report tabs ── */}
        <Tabs index={tabIdx} onChange={setTabIdx} colorScheme="purple" variant="enclosed">
          <TabList>
            <Tab fontSize="sm">💰 Cash Flow</Tab>
            <Tab fontSize="sm">💸 Expenses</Tab>
            <Tab fontSize="sm">📈 Net Worth</Tab>
            <Tab fontSize="sm">🧾 Tax</Tab>
          </TabList>

          <TabPanels>

            {/* ══ CASH FLOW ══════════════════════════════════════════════════ */}
            <TabPanel px={0} pt={4}>
              <VStack spacing={5} align="stretch">
                {/* Controls */}
                <GlassCard p={4}>
                  <HStack flexWrap="wrap" gap={3}>
                    <HStack>
                      <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">Year:</Text>
                      <Select size="sm" w="28" value={cfYear} onChange={e => setCfYear(parseInt(e.target.value))}>
                        {years.map(y => <option key={y} value={y}>{cfFiscal ? `FY ${y}-${String(y+1).slice(2)}` : String(y)}</option>)}
                      </Select>
                    </HStack>
                    <HStack>
                      <Text fontSize="sm" color="gray.500">Mode:</Text>
                      <Button size="xs" colorScheme={cfFiscal ? 'purple' : 'gray'} onClick={() => setCfFiscal(true)}>Indian FY (Apr–Mar)</Button>
                      <Button size="xs" colorScheme={!cfFiscal ? 'purple' : 'gray'} onClick={() => setCfFiscal(false)}>Calendar Year</Button>
                    </HStack>
                  </HStack>
                </GlassCard>

                {cfQuery.isLoading ? <Box textAlign="center" py={8}><Spinner color="purple.500" /></Box> :
                 cfQuery.data ? (
                  <VStack spacing={4} align="stretch">
                    {/* KPIs */}
                    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                      {[
                        { label: 'Total Income',   value: formatINR(cfQuery.data.total_income),   color: 'green.500' },
                        { label: 'Total Expense',  value: formatINR(cfQuery.data.total_expense),  color: 'red.500'   },
                        { label: 'Net Savings',    value: formatINR(cfQuery.data.total_savings),  color: cfQuery.data.total_savings >= 0 ? 'blue.500' : 'red.600' },
                        { label: 'Savings Rate',   value: `${cfQuery.data.savings_rate}%`,         color: cfQuery.data.savings_rate >= 20 ? 'green.500' : 'orange.500' },
                      ].map(s => (
                        <GlassCard key={s.label} p={4}>
                          <Stat>
                            <StatLabel fontSize="xs" color="gray.500">{s.label}</StatLabel>
                            <StatNumber fontSize="lg" color={s.color}>{s.value}</StatNumber>
                            <StatHelpText fontSize="10px">{cfQuery.data!.period_label}</StatHelpText>
                          </Stat>
                        </GlassCard>
                      ))}
                    </SimpleGrid>

                    {/* Bar chart */}
                    <GlassCard p={4}>
                      <Text fontSize="sm" fontWeight="semibold" mb={3}>Income vs Expense by Month</Text>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={cfQuery.data.rows} margin={{ left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(0, 3)} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/100000).toFixed(0)}L`} />
                          <RechartsTip formatter={(v: number) => formatINR(v)} />
                          <Legend />
                          <Bar dataKey="income"  name="Income"  fill="#48bb78" radius={[3,3,0,0]} />
                          <Bar dataKey="expense" name="Expense" fill="#f56565" radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </GlassCard>

                    {/* Savings trend */}
                    <GlassCard p={4}>
                      <Text fontSize="sm" fontWeight="semibold" mb={3}>Monthly Savings</Text>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={cfQuery.data.rows} margin={{ left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(0, 3)} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/100000).toFixed(0)}L`} />
                          <RechartsTip formatter={(v: number) => formatINR(v)} />
                          <Area type="monotone" dataKey="savings" name="Savings" stroke="#805ad5" fill="#e9d8fd" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </GlassCard>

                    {/* Monthly table */}
                    <GlassCard p={0} overflow="hidden">
                      <TableContainer>
                        <Table size="sm">
                          <Thead bg="gray.50" _dark={{ bg: 'gray.700' }}>
                            <Tr>
                              <Th fontSize="10px">Month</Th>
                              <Th isNumeric fontSize="10px">Income</Th>
                              <Th isNumeric fontSize="10px">Expense</Th>
                              <Th isNumeric fontSize="10px">Savings</Th>
                              <Th isNumeric fontSize="10px">Rate</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {cfQuery.data.rows.map(row => (
                              <Tr key={row.month}>
                                <Td fontSize="xs">{row.month}</Td>
                                <Td isNumeric fontSize="xs" color="green.600">{formatINR(row.income)}</Td>
                                <Td isNumeric fontSize="xs" color="red.500">{formatINR(row.expense)}</Td>
                                <Td isNumeric fontSize="xs" fontWeight="semibold" color={row.savings >= 0 ? 'blue.600' : 'red.600'}>{formatINR(row.savings)}</Td>
                                <Td isNumeric>
                                  <Badge colorScheme={row.savings_rate >= 20 ? 'green' : row.savings_rate >= 0 ? 'yellow' : 'red'} fontSize="9px">
                                    {row.savings_rate}%
                                  </Badge>
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </TableContainer>
                    </GlassCard>
                  </VStack>
                ) : null}
              </VStack>
            </TabPanel>

            {/* ══ EXPENSE BREAKDOWN ══════════════════════════════════════════ */}
            <TabPanel px={0} pt={4}>
              <VStack spacing={5} align="stretch">
                {/* Date range */}
                <GlassCard p={4}>
                  <HStack flexWrap="wrap" gap={3}>
                    <HStack>
                      <Text fontSize="sm" color="gray.500">From:</Text>
                      <Input size="sm" type="date" w="40" value={expFrom} onChange={e => setExpFrom(e.target.value)} />
                    </HStack>
                    <HStack>
                      <Text fontSize="sm" color="gray.500">To:</Text>
                      <Input size="sm" type="date" w="40" value={expTo} onChange={e => setExpTo(e.target.value)} />
                    </HStack>
                    {/* Quick presets */}
                    {[
                      { label: 'This Month', fn: () => { const [f,t]=thisMonthRange(); setExpFrom(f); setExpTo(t); } },
                      { label: 'Last 3M',    fn: () => { const t=new Date(); const f=new Date(t); f.setMonth(f.getMonth()-3); setExpFrom(f.toISOString().slice(0,10)); setExpTo(t.toISOString().slice(0,10)); } },
                      { label: 'This Year',  fn: () => { setExpFrom(`${CURRENT_YEAR}-01-01`); setExpTo(`${CURRENT_YEAR}-12-31`); } },
                    ].map(p => (
                      <Button key={p.label} size="xs" variant="outline" colorScheme="purple" onClick={p.fn}>{p.label}</Button>
                    ))}
                  </HStack>
                </GlassCard>

                {expQuery.isLoading ? <Box textAlign="center" py={8}><Spinner color="purple.500" /></Box> :
                 expQuery.data ? (
                  <VStack spacing={4} align="stretch">
                    <GlassCard p={4}>
                      <Stat>
                        <StatLabel fontSize="xs" color="gray.500">Total Expense</StatLabel>
                        <StatNumber color="red.500">{formatINR(expQuery.data.total)}</StatNumber>
                        <StatHelpText fontSize="10px">{expQuery.data.from_date} → {expQuery.data.to_date}</StatHelpText>
                      </Stat>
                    </GlassCard>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      {/* Pie chart */}
                      <GlassCard p={4}>
                        <Text fontSize="sm" fontWeight="semibold" mb={3}>By Category</Text>
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={expQuery.data.by_category} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={75} innerRadius={35}>
                              {expQuery.data.by_category.map((_, idx) => (
                                <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTip formatter={(v: number) => formatINR(v)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </GlassCard>

                      {/* Payment methods */}
                      <GlassCard p={4}>
                        <Text fontSize="sm" fontWeight="semibold" mb={3}>By Payment Method</Text>
                        <VStack spacing={3} align="stretch">
                          {expQuery.data.by_payment.map(pm => (
                            <Box key={pm.method}>
                              <HStack justify="space-between" mb={1}>
                                <Text fontSize="xs">{PM_ICONS[pm.method] ?? '•'} {pm.method.replace('_', ' ').toUpperCase()}</Text>
                                <HStack spacing={2}>
                                  <Text fontSize="xs" color="gray.500">{formatINR(pm.amount)}</Text>
                                  <Badge fontSize="9px" colorScheme="purple">{pm.pct}%</Badge>
                                </HStack>
                              </HStack>
                              <Progress value={pm.pct} size="xs" colorScheme="purple" borderRadius="full" />
                            </Box>
                          ))}
                          {!expQuery.data.by_payment.length && (
                            <Text fontSize="xs" color="gray.400">No payment method data</Text>
                          )}
                        </VStack>
                      </GlassCard>
                    </SimpleGrid>

                    {/* Category bars */}
                    <GlassCard p={4}>
                      <Text fontSize="sm" fontWeight="semibold" mb={3}>Category Breakdown</Text>
                      <VStack spacing={2} align="stretch">
                        {expQuery.data.by_category.map((cat, idx) => (
                          <Box key={cat.category}>
                            <HStack justify="space-between" mb={1}>
                              <HStack spacing={1.5}>
                                <Text fontSize="sm">{cat.icon}</Text>
                                <Text fontSize="xs">{cat.category}</Text>
                                <Text fontSize="9px" color="gray.400">({cat.count} txns)</Text>
                              </HStack>
                              <HStack spacing={2}>
                                <Text fontSize="xs" fontWeight="semibold">{formatINR(cat.amount)}</Text>
                                <Badge fontSize="9px" colorScheme="gray">{cat.pct}%</Badge>
                              </HStack>
                            </HStack>
                            <Progress value={cat.pct} size="sm" colorScheme="purple" borderRadius="full"
                              sx={{ '& > div': { background: PIE_COLORS[idx % PIE_COLORS.length] } }} />
                          </Box>
                        ))}
                      </VStack>
                    </GlassCard>

                    {/* Daily trend */}
                    {expQuery.data.daily_trend.length > 1 && (
                      <GlassCard p={4}>
                        <Text fontSize="sm" fontWeight="semibold" mb={3}>Daily Spending Trend</Text>
                        <ResponsiveContainer width="100%" height={160}>
                          <AreaChart data={expQuery.data.daily_trend} margin={{ left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v/100).toFixed(0)}`} />
                            <RechartsTip formatter={(v: number) => formatINR(v)} />
                            <Area type="monotone" dataKey="amount" name="Expense" stroke="#f56565" fill="#fed7d7" strokeWidth={1.5} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </GlassCard>
                    )}

                    {/* Top 5 expenses */}
                    {expQuery.data.top5.length > 0 && (
                      <GlassCard p={0} overflow="hidden">
                        <Box px={4} py={3} bg="gray.50" _dark={{ bg: 'gray.700' }}>
                          <Text fontSize="sm" fontWeight="semibold">Top 5 Expenses</Text>
                        </Box>
                        <TableContainer>
                          <Table size="sm">
                            <Thead>
                              <Tr>
                                <Th fontSize="10px">Date</Th>
                                <Th fontSize="10px">Description</Th>
                                <Th fontSize="10px">Category</Th>
                                <Th isNumeric fontSize="10px">Amount</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {expQuery.data.top5.map((t, i) => (
                                <Tr key={i}>
                                  <Td fontSize="xs" color="gray.500">{t.date}</Td>
                                  <Td fontSize="xs">{t.description || '—'}</Td>
                                  <Td fontSize="xs">{t.icon} {t.category}</Td>
                                  <Td isNumeric fontWeight="semibold" fontSize="xs" color="red.500">{formatINR(t.amount)}</Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </TableContainer>
                      </GlassCard>
                    )}
                  </VStack>
                ) : null}
              </VStack>
            </TabPanel>

            {/* ══ NET WORTH TREND ════════════════════════════════════════════ */}
            <TabPanel px={0} pt={4}>
              <VStack spacing={5} align="stretch">
                <GlassCard p={4}>
                  <HStack>
                    <Text fontSize="sm" color="gray.500">Show last:</Text>
                    {[3,6,12,24].map(m => (
                      <Button key={m} size="xs" colorScheme={nwMonths === m ? 'purple' : 'gray'} onClick={() => setNwMonths(m)}>{m}m</Button>
                    ))}
                  </HStack>
                </GlassCard>

                {nwQuery.isLoading ? <Box textAlign="center" py={8}><Spinner color="purple.500" /></Box> :
                 nwQuery.data ? (
                  <VStack spacing={4} align="stretch">
                    {/* KPIs */}
                    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                      {nwQuery.data.latest && (
                        <>
                          <GlassCard p={4}>
                            <Stat>
                              <StatLabel fontSize="xs" color="gray.500">Current Net Worth</StatLabel>
                              <StatNumber fontSize="lg" color="purple.600">{formatINR(nwQuery.data.latest.net_worth)}</StatNumber>
                            </Stat>
                          </GlassCard>
                          <GlassCard p={4}>
                            <Stat>
                              <StatLabel fontSize="xs" color="gray.500">Total Assets</StatLabel>
                              <StatNumber fontSize="lg" color="green.500">{formatINR(nwQuery.data.latest.total_assets)}</StatNumber>
                            </Stat>
                          </GlassCard>
                          <GlassCard p={4}>
                            <Stat>
                              <StatLabel fontSize="xs" color="gray.500">Total Liabilities</StatLabel>
                              <StatNumber fontSize="lg" color="red.500">{formatINR(nwQuery.data.latest.total_liabilities)}</StatNumber>
                            </Stat>
                          </GlassCard>
                        </>
                      )}
                    </SimpleGrid>

                    {nwQuery.data.change !== 0 && (
                      <GlassCard p={4}>
                        <HStack>
                          <Text fontSize="sm" color="gray.500">Change over period:</Text>
                          <Text fontWeight="bold" color={nwQuery.data.change >= 0 ? 'green.500' : 'red.500'} fontSize="md">
                            {nwQuery.data.change >= 0 ? '+' : ''}{formatINR(nwQuery.data.change)}
                          </Text>
                          <Badge colorScheme={nwQuery.data.change_pct >= 0 ? 'green' : 'red'}>
                            {nwQuery.data.change >= 0 ? '▲' : '▼'} {Math.abs(nwQuery.data.change_pct)}%
                          </Badge>
                        </HStack>
                      </GlassCard>
                    )}

                    {nwQuery.data.snapshots.length > 1 ? (
                      <>
                        <GlassCard p={4}>
                          <Text fontSize="sm" fontWeight="semibold" mb={3}>Net Worth Trend</Text>
                          <ResponsiveContainer width="100%" height={240}>
                            <AreaChart data={nwQuery.data.snapshots} margin={{ left: -10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(0, 7)} />
                              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v/10000000).toFixed(1)}Cr`} />
                              <RechartsTip formatter={(v: number) => formatINR(v)} />
                              <Area type="monotone" dataKey="total_assets"      name="Assets"      stroke="#48bb78" fill="#c6f6d5" strokeWidth={1.5} />
                              <Area type="monotone" dataKey="total_liabilities" name="Liabilities" stroke="#f56565" fill="#fed7d7" strokeWidth={1.5} />
                              <Area type="monotone" dataKey="net_worth"         name="Net Worth"   stroke="#805ad5" fill="#e9d8fd" strokeWidth={2.5} />
                              <Legend />
                            </AreaChart>
                          </ResponsiveContainer>
                        </GlassCard>
                      </>
                    ) : (
                      <GlassCard>
                        <Box textAlign="center" py={6}>
                          <Text color="gray.400">Not enough history yet. Net worth snapshots are recorded daily.</Text>
                        </Box>
                      </GlassCard>
                    )}
                  </VStack>
                ) : null}
              </VStack>
            </TabPanel>

            {/* ══ TAX SUMMARY ════════════════════════════════════════════════ */}
            <TabPanel px={0} pt={4}>
              <VStack spacing={5} align="stretch">
                <GlassCard p={4}>
                  <HStack flexWrap="wrap" gap={3}>
                    <Text fontSize="sm" color="gray.500">Fiscal Year:</Text>
                    <Select size="sm" w="40" value={taxFy} onChange={e => setTaxFy(parseInt(e.target.value))}>
                      {years.map(y => <option key={y} value={y}>FY {y}-{String(y+1).slice(2)}</option>)}
                    </Select>
                    <Text fontSize="xs" color="gray.400">New Tax Regime slabs applied</Text>
                  </HStack>
                </GlassCard>

                {taxQuery.isLoading ? <Box textAlign="center" py={8}><Spinner color="purple.500" /></Box> :
                 taxQuery.data ? (
                  <VStack spacing={4} align="stretch">
                    {/* Income + Tax KPIs */}
                    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                      {[
                        { label: 'Gross Income',    value: formatINR(taxQuery.data.gross_income),    color: 'green.500' },
                        { label: 'Total Deductions',value: formatINR(taxQuery.data.deductions.total), color: 'blue.500' },
                        { label: 'Taxable Income',  value: formatINR(taxQuery.data.taxable_income),  color: 'orange.500' },
                        { label: 'Est. Tax',        value: formatINR(taxQuery.data.estimated_tax),   color: 'red.500' },
                      ].map(s => (
                        <GlassCard key={s.label} p={4}>
                          <Stat>
                            <StatLabel fontSize="xs" color="gray.500">{s.label}</StatLabel>
                            <StatNumber fontSize="lg" color={s.color}>{s.value}</StatNumber>
                          </Stat>
                        </GlassCard>
                      ))}
                    </SimpleGrid>

                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      {/* Deductions breakdown */}
                      <GlassCard p={4}>
                        <Text fontSize="sm" fontWeight="semibold" mb={3}>Deductions Summary</Text>
                        <VStack spacing={3} align="stretch">
                          {[
                            { label: 'Standard Deduction', amount: taxQuery.data.deductions.standard, section: '§16' },
                            { label: `Section 80C (limit ₹1.5L)`, amount: taxQuery.data.deductions['80C'], section: '80C', raw: taxQuery.data.deductions['80C_raw'], limit: taxQuery.data.deductions['80C_limit'] },
                            { label: 'NPS Additional', amount: taxQuery.data.deductions['80CCD_1B'], section: '80CCD(1B)' },
                          ].map(d => (
                            <Box key={d.section}>
                              <HStack justify="space-between" mb={1}>
                                <Box>
                                  <Text fontSize="xs" fontWeight="medium">{d.label}</Text>
                                  <Badge fontSize="8px" colorScheme="blue" variant="outline">{d.section}</Badge>
                                </Box>
                                <Text fontSize="sm" fontWeight="bold" color="blue.600">{formatINR(d.amount)}</Text>
                              </HStack>
                              {d.raw !== undefined && d.raw > d.limit && (
                                <Text fontSize="9px" color="orange.500">
                                  Invested {formatINR(d.raw)} → capped at {formatINR(d.limit)}
                                </Text>
                              )}
                              <Divider mt={1} />
                            </Box>
                          ))}
                          <HStack justify="space-between" pt={1}>
                            <Text fontSize="sm" fontWeight="bold">Total Deductions</Text>
                            <Text fontSize="sm" fontWeight="bold" color="blue.600">{formatINR(taxQuery.data.deductions.total)}</Text>
                          </HStack>
                        </VStack>
                      </GlassCard>

                      {/* Income by source */}
                      <GlassCard p={4}>
                        <Text fontSize="sm" fontWeight="semibold" mb={3}>Income by Source</Text>
                        <VStack spacing={2} align="stretch">
                          {Object.entries(taxQuery.data.income_by_source).map(([source, amount]) => {
                            const pct = taxQuery.data!.gross_income > 0 ? Math.round(amount / taxQuery.data!.gross_income * 100) : 0;
                            return (
                              <Box key={source}>
                                <HStack justify="space-between" mb={1}>
                                  <Text fontSize="xs" textTransform="capitalize">{source.replace('_', ' ')}</Text>
                                  <HStack spacing={1}>
                                    <Text fontSize="xs" fontWeight="semibold">{formatINR(amount)}</Text>
                                    <Badge fontSize="9px" colorScheme="gray">{pct}%</Badge>
                                  </HStack>
                                </HStack>
                                <Progress value={pct} size="xs" colorScheme="green" borderRadius="full" />
                              </Box>
                            );
                          })}
                          {!Object.keys(taxQuery.data.income_by_source).length && (
                            <Text fontSize="xs" color="gray.400">No income recorded for this FY</Text>
                          )}
                        </VStack>
                      </GlassCard>
                    </SimpleGrid>

                    {/* 80C Investments */}
                    {Object.keys(taxQuery.data.investments_80c).length > 0 && (
                      <GlassCard p={4}>
                        <Text fontSize="sm" fontWeight="semibold" mb={1}>80C Qualifying Investments</Text>
                        <Text fontSize="xs" color="gray.400" mb={3}>PPF, EPF, NPS, ELSS, FD, Post Office</Text>
                        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                          {Object.entries(taxQuery.data.investments_80c).map(([type, amount]) => (
                            <Box key={type} bg="blue.50" _dark={{ bg: 'blue.900' }} p={3} borderRadius="lg">
                              <Text fontSize="xs" color="gray.500">{type}</Text>
                              <Text fontWeight="bold" color="blue.600" fontSize="sm">{formatINR(amount)}</Text>
                            </Box>
                          ))}
                        </SimpleGrid>
                        <Box mt={3} p={3} bg={taxQuery.data.deductions['80C_raw'] >= taxQuery.data.deductions['80C_limit'] ? 'green.50' : 'yellow.50'}
                          borderRadius="md" _dark={{ bg: taxQuery.data.deductions['80C_raw'] >= taxQuery.data.deductions['80C_limit'] ? 'green.900' : 'yellow.900' }}>
                          {taxQuery.data.deductions['80C_raw'] >= taxQuery.data.deductions['80C_limit'] ? (
                            <Text fontSize="xs" color="green.700" _dark={{ color: 'green.200' }}>
                              ✅ 80C limit fully utilised — you're claiming the maximum ₹1.5L deduction.
                            </Text>
                          ) : (
                            <Text fontSize="xs" color="yellow.700" _dark={{ color: 'yellow.200' }}>
                              💡 You can invest {formatINR(taxQuery.data.deductions['80C_limit'] - taxQuery.data.deductions['80C_raw'])} more in 80C instruments to maximise your deduction.
                            </Text>
                          )}
                        </Box>
                      </GlassCard>
                    )}

                    {/* Effective rate banner */}
                    <GlassCard p={4} bgGradient={taxQuery.data.estimated_tax === 0 ? 'linear(to-r, green.50, teal.50)' : 'linear(to-r, orange.50, red.50)'}
                      _dark={{ bgGradient: taxQuery.data.estimated_tax === 0 ? 'linear(to-r, green.900, teal.900)' : 'linear(to-r, orange.900, red.900)' }}>
                      <HStack justify="space-between" flexWrap="wrap" gap={2}>
                        <Box>
                          <Text fontSize="xs" color="gray.500">Effective Tax Rate</Text>
                          <Text fontSize="2xl" fontWeight="black" color={taxQuery.data.estimated_tax === 0 ? 'green.600' : 'red.500'}>
                            {taxQuery.data.effective_rate}%
                          </Text>
                          {taxQuery.data.estimated_tax === 0 && (
                            <Text fontSize="xs" color="green.600">🎉 Zero tax — income within ₹12L rebate limit (87A)</Text>
                          )}
                        </Box>
                        <Box textAlign="right">
                          <Text fontSize="xs" color="gray.500">Estimated tax payable</Text>
                          <Text fontSize="xl" fontWeight="bold" color={taxQuery.data.estimated_tax === 0 ? 'green.600' : 'red.500'}>
                            {formatINR(taxQuery.data.estimated_tax)}
                          </Text>
                          <Text fontSize="9px" color="gray.400">Includes 4% cess · New Regime</Text>
                        </Box>
                      </HStack>
                    </GlassCard>
                  </VStack>
                ) : null}
              </VStack>
            </TabPanel>

          </TabPanels>
        </Tabs>
      </VStack>
    </PageWrapper>
  );
}
