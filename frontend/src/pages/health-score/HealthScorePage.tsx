import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Badge, Spinner,
  CircularProgress, CircularProgressLabel, Progress, Divider,
  Stat, StatLabel, StatNumber, StatHelpText,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer,
} from 'recharts';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { formatINR } from '../../lib/utils';
import api from '../../services/api';

// ── types ─────────────────────────────────────────────────────────────────────

interface ComponentDetail {
  score: number;
  max: number;
  detail: Record<string, number | boolean | string>;
}

interface HealthScoreData {
  score: number;
  rating: 'poor' | 'average' | 'good' | 'excellent';
  recorded_date: string;
  components: {
    savings_ratio:      ComponentDetail;
    debt_ratio:         ComponentDetail;
    emergency_fund:     ComponentDetail;
    investment_ratio:   ComponentDetail;
    credit_utilization: ComponentDetail;
    insurance:          ComponentDetail;
  };
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    title: string;
    body: string;
    icon: string;
  }>;
  history: Array<{ date: string; score: number; rating: string }>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.8) return 'green';
  if (pct >= 0.6) return 'yellow';
  if (pct >= 0.3) return 'orange';
  return 'red';
}

function ratingColor(rating: string) {
  return { excellent: 'green', good: 'blue', average: 'yellow', poor: 'red' }[rating] ?? 'gray';
}

function gaugeColor(score: number): string {
  if (score >= 80) return '#48bb78';  // green
  if (score >= 60) return '#4299e1';  // blue
  if (score >= 40) return '#ed8936';  // orange
  return '#f56565';                    // red
}

// ── component cards config ────────────────────────────────────────────────────

function componentMeta(key: string, detail: Record<string, number | boolean | string>) {
  switch (key) {
    case 'savings_ratio':
      return {
        label: 'Savings Rate',
        icon: '💰',
        value: `${detail.rate_pct ?? 0}%`,
        target: 'Target: >20%',
        tip: 'Save at least 20% of your monthly income.',
        subtext: `Income ${formatINR(Number(detail.monthly_income ?? 0))} · Expense ${formatINR(Number(detail.monthly_expense ?? 0))} / month`,
      };
    case 'debt_ratio':
      return {
        label: 'Debt-to-Income',
        icon: '🏦',
        value: `${detail.dti_pct ?? 0}%`,
        target: 'Target: <30%',
        tip: 'Keep total EMIs under 30% of monthly income.',
        subtext: `Monthly EMI ${formatINR(Number(detail.monthly_emi ?? 0))}`,
      };
    case 'emergency_fund':
      return {
        label: 'Emergency Fund',
        icon: '🛡️',
        value: `${detail.months_covered ?? 0} months`,
        target: 'Target: 6+ months',
        tip: 'Keep 6 months of expenses in a liquid account.',
        subtext: `Liquid balance ${formatINR(Number(detail.liquid_balance ?? 0))}`,
      };
    case 'investment_ratio':
      return {
        label: 'Investment Wealth',
        icon: '📈',
        value: `${detail.ratio_pct ?? 0}% of annual income`,
        target: 'Target: >100%',
        tip: 'Aim for investments ≥ 1× your annual income.',
        subtext: `Total investments ${formatINR(Number(detail.total_investment_value ?? 0))}`,
      };
    case 'credit_utilization':
      return {
        label: 'Credit Utilization',
        icon: '💳',
        value: `${detail.avg_utilization_pct ?? 0}%`,
        target: 'Target: <30%',
        tip: 'Low utilization protects your credit score.',
        subtext: detail.has_cards === false ? 'No credit cards' : `Outstanding ${formatINR(Number(detail.total_outstanding ?? 0))}`,
      };
    case 'insurance':
      return {
        label: 'Insurance Coverage',
        icon: '❤️',
        value: `${Number(detail.total_policies ?? 0)} active policies`,
        target: 'Health + Life needed',
        tip: 'At minimum, have health and term life insurance.',
        subtext: `Health: ${detail.has_health ? '✅' : '❌'}  Life: ${detail.has_life ? '✅' : '❌'}`,
      };
    default:
      return { label: key, icon: '•', value: '', target: '', tip: '', subtext: '' };
  }
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function HealthScorePage() {
  const { data, isLoading } = useQuery<HealthScoreData>({
    queryKey: ['health-score'],
    queryFn: () => api.get('/health-score').then(r => r.data),
    staleTime: 1000 * 60 * 10,  // recompute at most every 10 min
  });

  if (isLoading) {
    return (
      <PageWrapper>
        <VStack h="60vh" justify="center">
          <Spinner size="xl" color="purple.500" thickness="4px" />
          <Text color="gray.500">Calculating your financial health…</Text>
        </VStack>
      </PageWrapper>
    );
  }

  if (!data) return null;

  const priorityColor = { high: 'red', medium: 'orange', low: 'green' };

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>

        {/* ── Header ── */}
        <Box>
          <Heading size="lg">Financial Health Score</Heading>
          <Text color="gray.500" fontSize="sm">Based on your live financial data · Updated {data.recorded_date}</Text>
        </Box>

        {/* ── Score hero ── */}
        <GlassCard>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} alignItems="center" p={2}>

            {/* Gauge */}
            <VStack justify="center">
              <Box position="relative">
                <CircularProgress
                  value={data.score}
                  size="160px"
                  thickness="10px"
                  color={gaugeColor(data.score)}
                  trackColor="gray.100"
                  capIsRound
                >
                  <CircularProgressLabel>
                    <VStack spacing={0}>
                      <Text fontSize="3xl" fontWeight="black" lineHeight="1" color={gaugeColor(data.score)}>
                        {data.score}
                      </Text>
                      <Text fontSize="xs" color="gray.400">/100</Text>
                    </VStack>
                  </CircularProgressLabel>
                </CircularProgress>
              </Box>
              <Badge colorScheme={ratingColor(data.rating)} fontSize="sm" px={3} py={1} borderRadius="full" textTransform="capitalize">
                {data.rating}
              </Badge>
            </VStack>

            {/* Score breakdown bars */}
            <Box gridColumn={{ base: '1', md: 'span 2' }}>
              <Text fontSize="sm" fontWeight="semibold" color="gray.600" mb={3}>Score Breakdown</Text>
              <VStack spacing={3} align="stretch">
                {Object.entries(data.components).map(([key, comp]) => {
                  const meta  = componentMeta(key, comp.detail);
                  const pct   = Math.round(comp.score / comp.max * 100);
                  const color = scoreColor(comp.score, comp.max);
                  return (
                    <Box key={key}>
                      <HStack justify="space-between" mb={1}>
                        <HStack spacing={1.5}>
                          <Text fontSize="sm">{meta.icon}</Text>
                          <Text fontSize="xs" fontWeight="medium">{meta.label}</Text>
                        </HStack>
                        <HStack spacing={2}>
                          <Text fontSize="xs" color="gray.400">{meta.value}</Text>
                          <Text fontSize="xs" fontWeight="bold" color={`${color}.600`}>
                            {comp.score}/{comp.max}
                          </Text>
                        </HStack>
                      </HStack>
                      <Progress value={pct} colorScheme={color} size="sm" borderRadius="full" />
                    </Box>
                  );
                })}
              </VStack>
            </Box>
          </SimpleGrid>
        </GlassCard>

        {/* ── Component cards ── */}
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={4}>
          {Object.entries(data.components).map(([key, comp]) => {
            const meta   = componentMeta(key, comp.detail);
            const pct    = Math.round(comp.score / comp.max * 100);
            const color  = scoreColor(comp.score, comp.max);
            return (
              <GlassCard key={key} p={4}>
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <HStack>
                      <Text fontSize="xl">{meta.icon}</Text>
                      <Text fontSize="sm" fontWeight="semibold">{meta.label}</Text>
                    </HStack>
                    <Badge colorScheme={color} fontSize="xs">{comp.score}/{comp.max}</Badge>
                  </HStack>

                  <Progress value={pct} colorScheme={color} size="md" borderRadius="full" />

                  <Box>
                    <Text fontSize="lg" fontWeight="bold" color={`${color}.600`}>{meta.value}</Text>
                    <Text fontSize="10px" color="gray.400">{meta.target}</Text>
                  </Box>

                  <Divider />

                  <Text fontSize="xs" color="gray.500">{meta.subtext}</Text>

                  {pct < 80 && (
                    <Box bg="gray.50" _dark={{ bg: 'gray.700' }} p={2} borderRadius="md">
                      <Text fontSize="10px" color="gray.600" _dark={{ color: 'gray.300' }}>💡 {meta.tip}</Text>
                    </Box>
                  )}
                </VStack>
              </GlassCard>
            );
          })}
        </SimpleGrid>

        {/* ── Recommendations ── */}
        <GlassCard>
          <Heading size="sm" mb={4}>Action Plan</Heading>
          <VStack spacing={3} align="stretch">
            {data.recommendations.map((rec, i) => (
              <Box
                key={i}
                border="1px solid"
                borderColor={`${priorityColor[rec.priority]}.200`}
                bg={`${priorityColor[rec.priority]}.50`}
                _dark={{ bg: `${priorityColor[rec.priority]}.900`, borderColor: `${priorityColor[rec.priority]}.700` }}
                borderRadius="lg"
                p={3}
              >
                <HStack align="flex-start" spacing={3}>
                  <Text fontSize="xl" flexShrink={0}>{rec.icon}</Text>
                  <Box flex={1}>
                    <HStack mb={1}>
                      <Text fontSize="sm" fontWeight="semibold">{rec.title}</Text>
                      <Badge colorScheme={priorityColor[rec.priority]} fontSize="9px" textTransform="capitalize">
                        {rec.priority}
                      </Badge>
                    </HStack>
                    <Text fontSize="xs" color="gray.600" _dark={{ color: 'gray.300' }}>{rec.body}</Text>
                  </Box>
                </HStack>
              </Box>
            ))}
          </VStack>
        </GlassCard>

        {/* ── History chart ── */}
        {data.history.length > 1 && (
          <GlassCard>
            <Heading size="sm" mb={4}>Score History (Last 30 Days)</Heading>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.history} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={d => d.slice(5)}  // MM-DD
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <RechartsTip
                  formatter={(v: number) => [`${v}/100`, 'Score']}
                  labelFormatter={l => `Date: ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#805ad5"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#805ad5' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </GlassCard>
        )}

        {/* ── Quick stats row ── */}
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
          {[
            { label: 'Savings Rate',      value: `${data.components.savings_ratio.detail.rate_pct ?? 0}%`,        color: 'green.500' },
            { label: 'EMI-to-Income',     value: `${data.components.debt_ratio.detail.dti_pct ?? 0}%`,           color: 'orange.500' },
            { label: 'Emergency Cover',   value: `${data.components.emergency_fund.detail.months_covered ?? 0}m`, color: 'blue.500' },
            { label: 'CC Utilization',    value: `${data.components.credit_utilization.detail.avg_utilization_pct ?? 0}%`, color: 'purple.500' },
          ].map(s => (
            <GlassCard key={s.label} p={4}>
              <Stat>
                <StatLabel fontSize="xs" color="gray.500">{s.label}</StatLabel>
                <StatNumber fontSize="xl" color={s.color}>{s.value}</StatNumber>
              </Stat>
            </GlassCard>
          ))}
        </SimpleGrid>

      </VStack>
    </PageWrapper>
  );
}
