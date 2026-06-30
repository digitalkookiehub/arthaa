import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Stat, StatLabel,
  StatNumber, Progress, Badge, Spinner, Divider,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTip, ResponsiveContainer, Legend,
} from 'recharts';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR } from '../../lib/utils';
import api from '../../services/api';
import { useToast } from '@chakra-ui/react';

interface NetWorthData {
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  total_account_balance: number;
  total_investment_value: number;
  total_asset_value: number;
  total_outstanding_loans: number;
}

interface HistoryItem {
  recorded_date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
}

function safePct(part: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function axisLabel(paise: number) {
  const r = paise / 100;
  if (r >= 10_000_000) return `₹${(r / 10_000_000).toFixed(1)}Cr`;
  if (r >= 100_000)    return `₹${(r / 100_000).toFixed(1)}L`;
  return `₹${(r / 1_000).toFixed(0)}K`;
}

export default function NetWorthPage() {
  const toast = useToast();
  const qc    = useQueryClient();

  const { data: nw, isLoading } = useQuery<NetWorthData>({
    queryKey: ['net-worth-latest'],
    queryFn:  () => api.get('/net-worth/latest').then(r => r.data),
    retry: false,
  });

  const { data: history } = useQuery<HistoryItem[]>({
    queryKey: ['net-worth-history'],
    queryFn:  () => api.get('/net-worth/history', { params: { months: 12 } }).then(r => r.data),
    retry: false,
  });

  const snapshotMutation = useMutation({
    mutationFn: () => api.post('/net-worth/snapshot'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['net-worth-latest'] });
      qc.invalidateQueries({ queryKey: ['net-worth-history'] });
      toast({ title: 'Snapshot saved', status: 'success', duration: 2000 });
    },
    onError: () => toast({ title: 'Snapshot failed', status: 'error', duration: 2000 }),
  });

  // Chart data stays in paise so formatINR works in tooltip
  const chartData = (history ?? []).map(h => ({
    date:          new Date(h.recorded_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    'Net Worth':   h.net_worth,
    'Assets':      h.total_assets,
    'Liabilities': h.total_liabilities,
  }));

  const assetTotal = nw?.total_assets ?? 0;
  const nwPositive = (nw?.net_worth ?? 0) >= 0;

  const composition = [
    { label: 'Bank Accounts',   value: nw?.total_account_balance  ?? 0, color: '#48bb78', icon: '🏦', to: '/accounts'    },
    { label: 'Investments',     value: nw?.total_investment_value  ?? 0, color: '#805ad5', icon: '📈', to: '/investments' },
    { label: 'Physical Assets', value: nw?.total_asset_value       ?? 0, color: '#ecc94b', icon: '🏠', to: '/assets'      },
  ];

  const debtRatio = assetTotal > 0 ? (nw?.total_liabilities ?? 0) / assetTotal : 0;

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>

        {/* Header */}
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Net Worth</Heading>
            <Text color="gray.500" fontSize="sm">Assets − Liabilities = your financial position</Text>
          </Box>
          <GradientButton size="sm" onClick={() => snapshotMutation.mutate()} isLoading={snapshotMutation.isPending}>
            Take Snapshot
          </GradientButton>
        </HStack>

        {isLoading ? (
          <Box textAlign="center" p={12}><Spinner color="purple.500" size="xl" /></Box>
        ) : nw ? (
          <>
            {/* Hero */}
            <Box
              bgGradient="linear(135deg, purple.600 0%, purple.400 50%, pink.400 100%)"
              p={8} textAlign="center" borderRadius="2xl"
            >
              <Text fontSize="sm" color="whiteAlpha.700" mb={1}>Total Net Worth</Text>
              <Heading size="2xl" color="white" mb={2}>{formatINR(nw.net_worth)}</Heading>
              <Badge
                bg="whiteAlpha.200" color="white" fontSize="xs" px={3} py={1} borderRadius="full"
              >
                {nwPositive ? '▲ Positive' : '▼ Negative'} net worth
              </Badge>

              <SimpleGrid columns={2} spacing={6} mt={6}>
                <Box>
                  <Text fontSize="xs" color="whiteAlpha.700">Total Assets</Text>
                  <Text fontSize="xl" fontWeight="black" color="green.200">{formatINR(nw.total_assets)}</Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color="whiteAlpha.700">Total Liabilities</Text>
                  <Text fontSize="xl" fontWeight="black" color="red.200">{formatINR(nw.total_liabilities)}</Text>
                </Box>
              </SimpleGrid>
            </Box>

            {/* Assets vs Liabilities bar */}
            <GlassCard p={5} noHover>
              <Text fontSize="sm" fontWeight="semibold" mb={3}>Assets vs Liabilities</Text>
              <HStack spacing={0} h="12px" borderRadius="full" overflow="hidden" mb={2}>
                <Box
                  w={`${safePct(nw.total_assets, nw.total_assets + nw.total_liabilities)}%`}
                  bg="green.400" h="100%"
                />
                <Box flex={1} bg="red.400" h="100%" />
              </HStack>
              <HStack justify="space-between" fontSize="xs" color="gray.500">
                <HStack spacing={1}>
                  <Box w="8px" h="8px" borderRadius="full" bg="green.400" />
                  <Text>Assets {safePct(nw.total_assets, nw.total_assets + nw.total_liabilities)}%</Text>
                </HStack>
                <HStack spacing={1}>
                  <Box w="8px" h="8px" borderRadius="full" bg="red.400" />
                  <Text>Liabilities {safePct(nw.total_liabilities, nw.total_assets + nw.total_liabilities)}%</Text>
                </HStack>
              </HStack>
            </GlassCard>

            {/* Asset composition */}
            <GlassCard p={5} noHover>
              <Text fontSize="sm" fontWeight="semibold" mb={4}>Asset Composition</Text>
              <VStack spacing={4} align="stretch">
                {composition.map(c => (
                  <ChakraLink key={c.label} as={Link} to={c.to} _hover={{ textDecor: 'none', opacity: 0.8 }}>
                    <HStack justify="space-between" mb={1}>
                      <HStack spacing={2}>
                        <Text fontSize="sm">{c.icon}</Text>
                        <Text fontSize="sm" fontWeight="medium">{c.label}</Text>
                      </HStack>
                      <HStack spacing={2}>
                        <Text fontSize="sm" fontWeight="semibold">{formatINR(c.value)}</Text>
                        <Badge fontSize="9px" variant="subtle" colorScheme="gray">
                          {safePct(c.value, assetTotal)}%
                        </Badge>
                      </HStack>
                    </HStack>
                    <Progress
                      value={safePct(c.value, assetTotal)}
                      size="sm" borderRadius="full"
                      sx={{ '& > div': { background: c.color } }}
                    />
                  </ChakraLink>
                ))}
                <Divider />
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.500">Total Assets</Text>
                  <Text fontSize="sm" fontWeight="bold" color="green.500">{formatINR(nw.total_assets)}</Text>
                </HStack>
              </VStack>
            </GlassCard>

            {/* Liabilities */}
            <GlassCard p={5} noHover>
              <HStack justify="space-between" mb={3}>
                <Text fontSize="sm" fontWeight="semibold">Liabilities</Text>
                <ChakraLink as={Link} to="/loans" fontSize="11px" color="purple.500">
                  Manage loans →
                </ChakraLink>
              </HStack>
              <HStack
                justify="space-between" p={4}
                bg="red.50" _dark={{ bg: 'red.900' }}
                borderRadius="xl" borderLeftWidth="4px" borderLeftColor="red.400"
              >
                <HStack spacing={2}>
                  <Text fontSize="lg">🏦</Text>
                  <Box>
                    <Text fontSize="sm" fontWeight="medium">Outstanding Loans</Text>
                    <Text fontSize="xs" color="gray.500">Home, personal, gold, car, education</Text>
                  </Box>
                </HStack>
                <Text fontSize="lg" fontWeight="black" color="red.500">
                  {formatINR(nw.total_outstanding_loans)}
                </Text>
              </HStack>
              {nw.total_liabilities > 0 && assetTotal > 0 && (
                <Box mt={3} p={3} bg="blue.50" _dark={{ bg: 'blue.900' }} borderRadius="lg">
                  <Text fontSize="xs" color="blue.700" _dark={{ color: 'blue.200' }}>
                    💡 Debt-to-Asset ratio: <strong>{(debtRatio * 100).toFixed(1)}%</strong>
                    {debtRatio < 0.5 ? ' — Healthy (below 50%)' : ' — High. Focus on loan repayment.'}
                  </Text>
                </Box>
              )}
            </GlassCard>

            {/* History chart */}
            {chartData.length > 0 && (
              <GlassCard p={5} noHover>
                <Text fontSize="sm" fontWeight="semibold" mb={4}>Net Worth Trend (12 months)</Text>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ left: -5 }}>
                    <defs>
                      <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#805ad5" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#805ad5" stopOpacity={0}   />
                      </linearGradient>
                      <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#48bb78" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#48bb78" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={axisLabel} />
                    <RechartsTip
                      formatter={(val: number, name: string) => [formatINR(val), name]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="Assets"      stroke="#48bb78" fill="url(#assetGrad)" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="Liabilities" stroke="#f56565" fill="#fed7d7" strokeWidth={1.5} fillOpacity={0.3} />
                    <Area type="monotone" dataKey="Net Worth"   stroke="#805ad5" fill="url(#nwGrad)"    strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
                {chartData.length < 2 && (
                  <Text fontSize="xs" color="gray.400" textAlign="center" mt={2}>
                    Take more snapshots over time to see the trend.
                  </Text>
                )}
              </GlassCard>
            )}

            {/* Quick stats */}
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
              {[
                { label: 'Bank Accounts',   value: nw.total_account_balance,  color: 'green.500'  },
                { label: 'Investments',     value: nw.total_investment_value,  color: 'purple.500' },
                { label: 'Physical Assets', value: nw.total_asset_value,       color: 'yellow.600' },
                { label: 'Total Loans',     value: nw.total_outstanding_loans, color: 'red.500'    },
              ].map(s => (
                <GlassCard key={s.label} p={4}>
                  <Stat>
                    <StatLabel fontSize="10px" color="gray.500">{s.label}</StatLabel>
                    <StatNumber fontSize="md" color={s.color}>{formatINR(s.value)}</StatNumber>
                  </Stat>
                </GlassCard>
              ))}
            </SimpleGrid>
          </>
        ) : (
          <GlassCard p={8} textAlign="center">
            <Text color="gray.500" mb={4}>
              No snapshot yet. Click "Take Snapshot" to record your current net worth.
            </Text>
            <GradientButton onClick={() => snapshotMutation.mutate()} isLoading={snapshotMutation.isPending}>
              Take First Snapshot
            </GradientButton>
          </GlassCard>
        )}
      </VStack>
    </PageWrapper>
  );
}
