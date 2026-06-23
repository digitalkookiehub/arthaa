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
import { Income, PaginatedResponse } from '../../types';
import { useState } from 'react';

interface IncomeForm {
  source_type: string;
  date: string;
  amount: string;
  description: string;
}

const SOURCE_COLORS: Record<string, string> = {
  salary: 'green', freelance: 'blue', business: 'purple',
  rental: 'orange', investment: 'teal', gift: 'pink', other: 'gray',
};

export default function IncomePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<IncomeForm>();
  const { month, year } = getCurrentMonthYear();
  const [filterMonth, setFilterMonth] = useState(month);
  const [filterYear, setFilterYear] = useState(year);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const { data: incomes, isLoading } = useQuery<PaginatedResponse<Income>>({
    queryKey: ['income', filterMonth, filterYear],
    queryFn: () =>
      api.get('/income', { params: { month: filterMonth, year: filterYear, limit: 100 } }).then(r => r.data),
  });

  const { data: monthTotal } = useQuery<{ total: number }>({
    queryKey: ['income-total', filterMonth, filterYear],
    queryFn: () =>
      api.get('/income/monthly-total', { params: { month: filterMonth, year: filterYear } }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/income', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income'] });
      qc.invalidateQueries({ queryKey: ['income-total'] });
      toast({ title: 'Income added', status: 'success', duration: 2000 });
      reset(); onClose();
    },
    onError: () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/income/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income'] });
      qc.invalidateQueries({ queryKey: ['income-total'] });
      toast({ title: 'Income deleted', status: 'info', duration: 2000 });
    },
  });

  const onSubmit = (data: IncomeForm) => {
    createMutation.mutate({
      source_type: data.source_type,
      date: data.date,
      amount: Math.round(parseFloat(data.amount) * 100),
      description: data.description || null,
    });
  };

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Income</Heading>
            <Text color="gray.500" fontSize="sm">Track your earnings</Text>
          </Box>
          <GradientButton onClick={onOpen} size="sm">+ Add Income</GradientButton>
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
              <StatLabel fontSize="xs" color="gray.500">This Month</StatLabel>
              <StatNumber fontSize="lg" color="green.500">
                {monthTotal ? formatINR(monthTotal.total) : '—'}
              </StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Transactions</StatLabel>
              <StatNumber fontSize="lg">{incomes?.total ?? '—'}</StatNumber>
            </Stat>
          </GlassCard>
        </SimpleGrid>

        <GlassCard p={0} overflow="hidden">
          {isLoading ? (
            <Box p={8} textAlign="center"><Spinner color="purple.500" /></Box>
          ) : incomes?.data.length === 0 ? (
            <Box p={8} textAlign="center">
              <Text color="gray.500">No income records for this period.</Text>
              <Button mt={3} size="sm" colorScheme="green" variant="ghost" onClick={onOpen}>
                Add your first income
              </Button>
            </Box>
          ) : (
            <TableContainer>
              <Table size="sm">
                <Thead bg="gray.50" _dark={{ bg: 'gray.700' }}>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Source</Th>
                    <Th>Description</Th>
                    <Th isNumeric>Amount</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {incomes?.data.map(inc => (
                    <Tr key={inc.id} _hover={{ bg: 'gray.50' }}>
                      <Td fontSize="xs" color="gray.500">{formatDate(inc.date)}</Td>
                      <Td>
                        <Badge colorScheme={SOURCE_COLORS[inc.source_type] ?? 'gray'} variant="subtle" fontSize="xs">
                          {inc.source_type}
                        </Badge>
                      </Td>
                      <Td fontSize="sm" maxW="200px" isTruncated>{inc.description ?? '—'}</Td>
                      <Td isNumeric fontWeight="semibold" color="green.500">
                        {formatINR(inc.amount)}
                      </Td>
                      <Td>
                        <IconButton
                          aria-label="Delete" icon={<Text fontSize="xs">✕</Text>}
                          size="xs" variant="ghost" colorScheme="red"
                          onClick={() => deleteMutation.mutate(inc.id)}
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

      <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>Add Income</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Source</FormLabel>
                <Select placeholder="Select source" {...register('source_type', { required: true })}>
                  <option value="salary">Salary</option>
                  <option value="freelance">Freelance</option>
                  <option value="business">Business</option>
                  <option value="rental">Rental</option>
                  <option value="investment">Investment Returns</option>
                  <option value="gift">Gift</option>
                  <option value="other">Other</option>
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
                <FormLabel fontSize="sm">Description</FormLabel>
                <Textarea rows={2} placeholder="e.g. June salary from ACME Corp" {...register('description')} />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={() => { reset(); onClose(); }} size="sm">Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending}>
              Add Income
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}
