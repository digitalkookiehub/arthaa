import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber,
  StatHelpText, Button, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton, FormControl, FormLabel, Input,
  Select, Textarea, useDisclosure, useToast, Spinner, Badge, IconButton,
  NumberInput, NumberInputField,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR } from '../../lib/utils';
import api from '../../services/api';
import { Investment } from '../../types';

interface InvestmentForm {
  investment_type: string;
  name: string;
  invested_amount: string;
  current_value: string;
  returns_pct: string;
  start_date: string;
  notes: string;
}

interface PortfolioGroup {
  investment_type: string;
  total_invested: number;
  total_current_value: number;
  count: number;
}

const TYPE_COLORS: Record<string, string> = {
  ppf: '#6B46C1', epf: '#805AD5', nps: '#9F7AEA', sip: '#48BB78',
  mutual_fund: '#38A169', stocks: '#ECC94B', fd: '#4299E1', gold: '#F6AD55',
  post_office: '#FC8181',
};

const CHART_COLORS = ['#6B46C1','#48BB78','#ECC94B','#4299E1','#F6AD55','#FC8181','#805AD5','#38A169','#9F7AEA'];

export default function InvestmentsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<InvestmentForm>();

  const { data: investments, isLoading } = useQuery<Investment[]>({
    queryKey: ['investments'],
    queryFn: () => api.get('/investments').then(r => r.data),
  });

  const { data: portfolio } = useQuery<PortfolioGroup[]>({
    queryKey: ['portfolio-summary'],
    queryFn: () => api.get('/investments/portfolio-summary').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/investments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['investments'] });
      qc.invalidateQueries({ queryKey: ['portfolio-summary'] });
      toast({ title: 'Investment added', status: 'success', duration: 2000 });
      reset(); onClose();
    },
    onError: () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/investments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['investments'] });
      qc.invalidateQueries({ queryKey: ['portfolio-summary'] });
      toast({ title: 'Investment removed', status: 'info', duration: 2000 });
    },
  });

  const onSubmit = (data: InvestmentForm) => {
    createMutation.mutate({
      investment_type: data.investment_type,
      name: data.name,
      invested_amount: Math.round(parseFloat(data.invested_amount) * 100),
      current_value: Math.round(parseFloat(data.current_value) * 100),
      returns_pct: data.returns_pct ? parseFloat(data.returns_pct) : null,
      start_date: data.start_date || null,
      notes: data.notes || null,
    });
  };

  const totalInvested = investments?.reduce((s, i) => s + i.invested_amount, 0) ?? 0;
  const totalCurrent = investments?.reduce((s, i) => s + i.current_value, 0) ?? 0;
  const totalGain = totalCurrent - totalInvested;
  const totalReturnPct = totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(1) : '0';

  const chartData = portfolio?.map(g => ({
    name: g.investment_type.toUpperCase(),
    value: g.total_current_value,
  })) ?? [];

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Investments</Heading>
            <Text color="gray.500" fontSize="sm">Track your portfolio</Text>
          </Box>
          <GradientButton onClick={onOpen} size="sm">+ Add Investment</GradientButton>
        </HStack>

        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Invested</StatLabel>
              <StatNumber fontSize="lg">{formatINR(totalInvested)}</StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Current Value</StatLabel>
              <StatNumber fontSize="lg" color="purple.500">{formatINR(totalCurrent)}</StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Gain/Loss</StatLabel>
              <StatNumber fontSize="lg" color={totalGain >= 0 ? 'green.500' : 'red.500'}>
                {totalGain >= 0 ? '+' : ''}{formatINR(totalGain)}
              </StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Overall Return</StatLabel>
              <StatNumber fontSize="lg" color={parseFloat(totalReturnPct) >= 0 ? 'green.500' : 'red.500'}>
                {parseFloat(totalReturnPct) >= 0 ? '+' : ''}{totalReturnPct}%
              </StatNumber>
            </Stat>
          </GlassCard>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
          {/* Portfolio Chart */}
          {chartData.length > 0 && (
            <GlassCard>
              <Heading size="sm" mb={4}>Portfolio Breakdown</Heading>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    dataKey="value" nameKey="name">
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => formatINR(val)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </GlassCard>
          )}

          {/* Investment List */}
          <GlassCard>
            <Heading size="sm" mb={4}>Holdings</Heading>
            {isLoading ? (
              <Box textAlign="center" p={4}><Spinner color="purple.500" /></Box>
            ) : investments?.length === 0 ? (
              <Box textAlign="center" py={4}>
                <Text color="gray.500" fontSize="sm">No investments added yet.</Text>
              </Box>
            ) : (
              <VStack align="stretch" spacing={3} maxH="300px" overflowY="auto">
                {investments?.map(inv => (
                  <HStack key={inv.id} justify="space-between" py={2}
                    borderBottom="1px solid" borderColor="gray.100">
                    <VStack align="start" spacing={0}>
                      <HStack>
                        <Text fontSize="sm" fontWeight="semibold">{inv.name}</Text>
                        <Badge colorScheme="purple" fontSize="xs" variant="subtle">
                          {inv.investment_type.toUpperCase()}
                        </Badge>
                      </HStack>
                      <Text fontSize="xs" color="gray.500">
                        Invested: {formatINR(inv.invested_amount)}
                      </Text>
                    </VStack>
                    <HStack spacing={2}>
                      <VStack align="end" spacing={0}>
                        <Text fontSize="sm" fontWeight="bold">{formatINR(inv.current_value)}</Text>
                        <Text fontSize="xs" color={inv.gain_loss >= 0 ? 'green.500' : 'red.500'}>
                          {inv.gain_loss >= 0 ? '+' : ''}{formatINR(inv.gain_loss)}
                        </Text>
                      </VStack>
                      <IconButton
                        aria-label="Delete" icon={<Text fontSize="xs">✕</Text>}
                        size="xs" variant="ghost" colorScheme="red"
                        onClick={() => deleteMutation.mutate(inv.id)}
                      />
                    </HStack>
                  </HStack>
                ))}
              </VStack>
            )}
          </GlassCard>
        </SimpleGrid>
      </VStack>

      <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>Add Investment</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Type</FormLabel>
                <Select placeholder="Select type" {...register('investment_type', { required: true })}>
                  <option value="ppf">PPF</option>
                  <option value="epf">EPF</option>
                  <option value="nps">NPS</option>
                  <option value="sip">SIP</option>
                  <option value="mutual_fund">Mutual Fund</option>
                  <option value="stocks">Stocks</option>
                  <option value="fd">Fixed Deposit</option>
                  <option value="gold">Gold</option>
                  <option value="post_office">Post Office</option>
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Name / Description</FormLabel>
                <Input placeholder="e.g. SBI Bluechip Fund" {...register('name', { required: true })} />
              </FormControl>
              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Invested (₹)</FormLabel>
                  <NumberInput min={0}><NumberInputField placeholder="0" {...register('invested_amount', { required: true })} /></NumberInput>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Current Value (₹)</FormLabel>
                  <NumberInput min={0}><NumberInputField placeholder="0" {...register('current_value', { required: true })} /></NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Returns (%)</FormLabel>
                  <NumberInput step={0.1}><NumberInputField placeholder="12.5" {...register('returns_pct')} /></NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Start Date</FormLabel>
                  <Input type="date" {...register('start_date')} />
                </FormControl>
              </SimpleGrid>
              <FormControl>
                <FormLabel fontSize="sm">Notes</FormLabel>
                <Textarea rows={2} placeholder="Any notes..." {...register('notes')} />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending}>
              Add Investment
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}
