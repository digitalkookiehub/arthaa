import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber,
  Button, IconButton, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton, FormControl, FormLabel, Input,
  Select, Textarea, useDisclosure, useToast, Spinner, Badge, Table, Thead,
  Tbody, Tr, Th, Td, TableContainer, NumberInput, NumberInputField,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, formatDate, getCurrentMonthYear } from '../../lib/utils';
import api from '../../services/api';
import { Expense, ExpenseCategory, PaginatedResponse } from '../../types';
import { useState } from 'react';

interface ExpenseForm {
  category_id: string;
  date: string;
  amount: string;
  description: string;
  payment_method: string;
}

export default function ExpensesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<ExpenseForm>();
  const [editId, setEditId] = useState<number | null>(null);
  const { month, year } = getCurrentMonthYear();
  const [filterMonth, setFilterMonth] = useState(month);
  const [filterYear, setFilterYear] = useState(year);

  const { data: categories } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expenses/categories').then(r => r.data),
  });

  const { data: expenses, isLoading } = useQuery<PaginatedResponse<Expense>>({
    queryKey: ['expenses', filterMonth, filterYear],
    queryFn: () =>
      api.get('/expenses', { params: { month: filterMonth, year: filterYear, limit: 100 } }).then(r => r.data),
  });

  const { data: monthTotal } = useQuery<{ total: number }>({
    queryKey: ['expense-total', filterMonth, filterYear],
    queryFn: () =>
      api.get('/expenses/monthly-total', { params: { month: filterMonth, year: filterYear } }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/expenses', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-total'] });
      toast({ title: 'Expense added', status: 'success', duration: 2000 });
      handleClose();
    },
    onError: () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-total'] });
      toast({ title: 'Expense deleted', status: 'info', duration: 2000 });
    },
  });

  const handleClose = () => { reset(); setEditId(null); onClose(); };

  const onSubmit = (data: ExpenseForm) => {
    createMutation.mutate({
      category_id: parseInt(data.category_id),
      date: data.date,
      amount: Math.round(parseFloat(data.amount) * 100),
      description: data.description || null,
      payment_method: data.payment_method || null,
    });
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Expenses</Heading>
            <Text color="gray.500" fontSize="sm">Track your spending</Text>
          </Box>
          <GradientButton onClick={onOpen} size="sm">+ Add Expense</GradientButton>
        </HStack>

        {/* Month/Year Filter */}
        <HStack spacing={3}>
          <Select
            size="sm" w="120px" value={filterMonth}
            onChange={e => setFilterMonth(parseInt(e.target.value))}
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </Select>
          <Select
            size="sm" w="100px" value={filterYear}
            onChange={e => setFilterYear(parseInt(e.target.value))}
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </HStack>

        {/* Stats */}
        <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">This Month</StatLabel>
              <StatNumber fontSize="lg" color="red.500">
                {monthTotal ? formatINR(monthTotal.total) : '—'}
              </StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Transactions</StatLabel>
              <StatNumber fontSize="lg">{expenses?.total ?? '—'}</StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Avg per transaction</StatLabel>
              <StatNumber fontSize="lg">
                {expenses?.total && monthTotal?.total
                  ? formatINR(Math.round(monthTotal.total / expenses.total))
                  : '—'}
              </StatNumber>
            </Stat>
          </GlassCard>
        </SimpleGrid>

        {/* Expense List */}
        <GlassCard p={0} overflow="hidden">
          {isLoading ? (
            <Box p={8} textAlign="center"><Spinner color="purple.500" /></Box>
          ) : expenses?.data.length === 0 ? (
            <Box p={8} textAlign="center">
              <Text color="gray.500">No expenses for this period.</Text>
              <Button mt={3} size="sm" colorScheme="purple" variant="ghost" onClick={onOpen}>
                Add your first expense
              </Button>
            </Box>
          ) : (
            <TableContainer>
              <Table size="sm">
                <Thead bg="gray.50" _dark={{ bg: 'gray.700' }}>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Category</Th>
                    <Th>Description</Th>
                    <Th>Payment</Th>
                    <Th isNumeric>Amount</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {expenses?.data.map(exp => (
                    <Tr key={exp.id} _hover={{ bg: 'gray.50' }} _dark={{ _hover: { bg: 'gray.750' } }}>
                      <Td fontSize="xs" color="gray.500">{formatDate(exp.date)}</Td>
                      <Td>
                        <Badge colorScheme="purple" variant="subtle" fontSize="xs">
                          {exp.category?.name ?? 'Other'}
                        </Badge>
                      </Td>
                      <Td fontSize="sm" maxW="200px" isTruncated>{exp.description ?? '—'}</Td>
                      <Td fontSize="xs" color="gray.500">{exp.payment_method ?? '—'}</Td>
                      <Td isNumeric fontWeight="semibold" color="red.500">
                        {formatINR(exp.amount)}
                      </Td>
                      <Td>
                        <IconButton
                          aria-label="Delete"
                          icon={<Text fontSize="xs">✕</Text>}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() => deleteMutation.mutate(exp.id)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          )}
        </GlassCard>
      </VStack>

      {/* Add Expense Modal */}
      <Modal isOpen={isOpen} onClose={handleClose} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>Add Expense</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Category</FormLabel>
                <Select placeholder="Select category" {...register('category_id', { required: true })}>
                  {categories?.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Date</FormLabel>
                <Input type="date" defaultValue={new Date().toISOString().split('T')[0]}
                  {...register('date', { required: true })} />
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Amount (₹)</FormLabel>
                <NumberInput min={0.01}>
                  <NumberInputField placeholder="0.00" {...register('amount', { required: true })} />
                </NumberInput>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Payment Method</FormLabel>
                <Select placeholder="Select method" {...register('payment_method')}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="net_banking">Net Banking</option>
                  <option value="cheque">Cheque</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Description</FormLabel>
                <Textarea rows={2} placeholder="What was this for?" {...register('description')} />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={handleClose} size="sm">Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending}>
              Add Expense
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}
