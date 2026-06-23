import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Progress,
  Button, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton, FormControl, FormLabel,
  Select, useDisclosure, useToast, Spinner, Badge, NumberInput, NumberInputField,
  IconButton, Stat, StatLabel, StatNumber, StatHelpText,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, getCurrentMonthYear } from '../../lib/utils';
import api from '../../services/api';
import { Budget, ExpenseCategory } from '../../types';
import { useState } from 'react';

interface BudgetForm {
  category_id: string;
  budgeted_amount: string;
}

export default function BudgetsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<BudgetForm>();
  const { month, year } = getCurrentMonthYear();
  const [filterMonth, setFilterMonth] = useState(month);
  const [filterYear, setFilterYear] = useState(year);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const { data: budgets, isLoading } = useQuery<Budget[]>({
    queryKey: ['budgets', filterMonth, filterYear],
    queryFn: () =>
      api.get('/budgets', { params: { month: filterMonth, year: filterYear } }).then(r => r.data),
  });

  const { data: categories } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expenses/categories').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/budgets', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      toast({ title: 'Budget set', status: 'success', duration: 2000 });
      reset(); onClose();
    },
    onError: () => toast({ title: 'Failed to save budget', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/budgets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      toast({ title: 'Budget removed', status: 'info', duration: 2000 });
    },
  });

  const onSubmit = (data: BudgetForm) => {
    createMutation.mutate({
      category_id: parseInt(data.category_id),
      month: filterMonth,
      year: filterYear,
      budgeted_amount: Math.round(parseFloat(data.budgeted_amount) * 100),
    });
  };

  const totalBudgeted = budgets?.reduce((s, b) => s + b.budgeted_amount, 0) ?? 0;
  const totalSpent = budgets?.reduce((s, b) => s + b.spent_amount, 0) ?? 0;

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'red';
    if (pct >= 80) return 'orange';
    return 'green';
  };

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Budgets</Heading>
            <Text color="gray.500" fontSize="sm">Plan and track your spending limits</Text>
          </Box>
          <GradientButton onClick={onOpen} size="sm">+ Set Budget</GradientButton>
        </HStack>

        <HStack spacing={3}>
          <Select size="sm" w="120px" value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
          <Select size="sm" w="100px" value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </HStack>

        <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Budget</StatLabel>
              <StatNumber fontSize="lg">{formatINR(totalBudgeted)}</StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Spent</StatLabel>
              <StatNumber fontSize="lg" color={totalSpent > totalBudgeted ? 'red.500' : 'orange.500'}>
                {formatINR(totalSpent)}
              </StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Remaining</StatLabel>
              <StatNumber fontSize="lg" color="green.500">
                {formatINR(Math.max(0, totalBudgeted - totalSpent))}
              </StatNumber>
              <StatHelpText fontSize="xs">
                {totalBudgeted > 0
                  ? `${Math.round((totalSpent / totalBudgeted) * 100)}% used`
                  : 'Set budgets'}
              </StatHelpText>
            </Stat>
          </GlassCard>
        </SimpleGrid>

        {isLoading ? (
          <Box textAlign="center" p={8}><Spinner color="purple.500" /></Box>
        ) : budgets?.length === 0 ? (
          <GlassCard>
            <Box textAlign="center" py={6}>
              <Text color="gray.500" mb={3}>No budgets set for this month.</Text>
              <GradientButton size="sm" onClick={onOpen}>Set your first budget</GradientButton>
            </Box>
          </GlassCard>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {budgets?.map(budget => {
              const pct = Math.min(budget.utilization_pct, 100);
              const color = getProgressColor(budget.utilization_pct);
              const catName = categories?.find(c => c.id === budget.category_id)?.name ?? 'Category';
              return (
                <GlassCard key={budget.id}>
                  <HStack justify="space-between" mb={2}>
                    <HStack>
                      <Badge colorScheme="purple" variant="subtle">{catName}</Badge>
                      {budget.utilization_pct >= 100 && (
                        <Badge colorScheme="red" fontSize="xs">Over budget!</Badge>
                      )}
                    </HStack>
                    <IconButton
                      aria-label="Remove" icon={<Text fontSize="xs">✕</Text>}
                      size="xs" variant="ghost" colorScheme="red"
                      onClick={() => deleteMutation.mutate(budget.id)}
                    />
                  </HStack>
                  <Progress value={pct} colorScheme={color} size="sm" borderRadius="full" mb={2} />
                  <HStack justify="space-between" fontSize="sm">
                    <Text color="gray.600">
                      <Text as="span" fontWeight="semibold" color={`${color}.600`}>
                        {formatINR(budget.spent_amount)}
                      </Text>
                      {' spent'}
                    </Text>
                    <Text color="gray.500">{formatINR(budget.budgeted_amount)} budget</Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.400" mt={1}>
                    {budget.remaining_amount >= 0
                      ? `${formatINR(budget.remaining_amount)} remaining`
                      : `${formatINR(Math.abs(budget.remaining_amount))} over`}
                  </Text>
                </GlassCard>
              );
            })}
          </SimpleGrid>
        )}
      </VStack>

      <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="sm">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>Set Budget</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Category</FormLabel>
                <Select placeholder="Select category" {...register('category_id', { required: true })}>
                  {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Budget Amount (₹)</FormLabel>
                <NumberInput min={1}>
                  <NumberInputField placeholder="0" {...register('budgeted_amount', { required: true })} />
                </NumberInput>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending}>
              Save Budget
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}
