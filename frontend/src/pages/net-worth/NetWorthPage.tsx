import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber,
  StatHelpText, Button, Spinner, Divider,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, formatDate } from '../../lib/utils';
import api from '../../services/api';
import { useToast } from '@chakra-ui/react';

interface NetWorthData {
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  accounts_total: number;
  investments_total: number;
  assets_total: number;
}

interface HistoryItem {
  recorded_date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
}

export default function NetWorthPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const { data: nw, isLoading } = useQuery<NetWorthData>({
    queryKey: ['net-worth-latest'],
    queryFn: () => api.get('/net-worth/latest').then(r => r.data),
  });

  const { data: history } = useQuery<HistoryItem[]>({
    queryKey: ['net-worth-history'],
    queryFn: () => api.get('/net-worth/history', { params: { months: 12 } }).then(r => r.data),
  });

  const snapshotMutation = useMutation({
    mutationFn: () => api.post('/net-worth/snapshot'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['net-worth-latest'] });
      qc.invalidateQueries({ queryKey: ['net-worth-history'] });
      toast({ title: 'Snapshot saved', status: 'success', duration: 2000 });
    },
  });

  const chartData = history?.map(h => ({
    date: new Date(h.recorded_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    'Net Worth': Math.round(h.net_worth / 100),
    'Assets': Math.round(h.total_assets / 100),
    'Liabilities': Math.round(h.total_liabilities / 100),
  })) ?? [];

  const netWorthSign = (nw?.net_worth ?? 0) >= 0 ? 'green.500' : 'red.500';

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Net Worth</Heading>
            <Text color="gray.500" fontSize="sm">Your financial snapshot</Text>
          </Box>
          <GradientButton
            size="sm"
            onClick={() => snapshotMutation.mutate()}
            isLoading={snapshotMutation.isPending}
          >
            Take Snapshot
          </GradientButton>
        </HStack>

        {isLoading ? (
          <Box textAlign="center" p={12}><Spinner color="purple.500" size="xl" /></Box>
        ) : (
          <>
            {/* Hero Net Worth */}
            <GlassCard textAlign="center" py={8}>
              <Text fontSize="sm" color="gray.500" mb={2}>Total Net Worth</Text>
              <Heading size="2xl" color={netWorthSign} mb={1}>
                {nw ? formatINR(nw.net_worth) : '—'}
              </Heading>
              <Text fontSize="sm" color="gray.500">Assets minus Liabilities</Text>
            </GlassCard>

            {/* Breakdown */}
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <GlassCard p={4}>
                <Stat>
                  <StatLabel fontSize="xs" color="gray.500">Bank Accounts</StatLabel>
                  <StatNumber fontSize="lg">{nw ? formatINR(nw.accounts_total) : '—'}</StatNumber>
                </Stat>
              </GlassCard>
              <GlassCard p={4}>
                <Stat>
                  <StatLabel fontSize="xs" color="gray.500">Investments</StatLabel>
                  <StatNumber fontSize="lg">{nw ? formatINR(nw.investments_total) : '—'}</StatNumber>
                </Stat>
              </GlassCard>
              <GlassCard p={4}>
                <Stat>
                  <StatLabel fontSize="xs" color="gray.500">Physical Assets</StatLabel>
                  <StatNumber fontSize="lg">{nw ? formatINR(nw.assets_total) : '—'}</StatNumber>
                </Stat>
              </GlassCard>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 2 }} spacing={4}>
              <GlassCard p={4} borderLeft="4px solid" borderLeftColor="green.400">
                <Stat>
                  <StatLabel fontSize="xs" color="gray.500">Total Assets</StatLabel>
                  <StatNumber fontSize="xl" color="green.500">
                    {nw ? formatINR(nw.total_assets) : '—'}
                  </StatNumber>
                  <StatHelpText fontSize="xs">Accounts + Investments + Assets</StatHelpText>
                </Stat>
              </GlassCard>
              <GlassCard p={4} borderLeft="4px solid" borderLeftColor="red.400">
                <Stat>
                  <StatLabel fontSize="xs" color="gray.500">Total Liabilities</StatLabel>
                  <StatNumber fontSize="xl" color="red.500">
                    {nw ? formatINR(nw.total_liabilities) : '—'}
                  </StatNumber>
                  <StatHelpText fontSize="xs">Outstanding loans</StatHelpText>
                </Stat>
              </GlassCard>
            </SimpleGrid>

            {/* History Chart */}
            {chartData.length > 0 && (
              <GlassCard>
                <Heading size="sm" mb={4}>Net Worth Trend (12 months)</Heading>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6B46C1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6B46C1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                    <Tooltip formatter={(val: number) => [`₹${(val / 100000).toFixed(2)}L`, '']} />
                    <Area
                      type="monotone" dataKey="Net Worth" stroke="#6B46C1"
                      fill="url(#netWorthGradient)" strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </GlassCard>
            )}
          </>
        )}
      </VStack>
    </PageWrapper>
  );
}
