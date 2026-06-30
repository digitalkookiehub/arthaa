import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber,
  Button, IconButton, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton, FormControl, FormLabel, Input,
  Select, Textarea, useDisclosure, useToast, Spinner, Badge, Table, Thead,
  Tbody, Tr, Th, Td, TableContainer, NumberInput, NumberInputField,
  Checkbox, Alert, AlertIcon, Tooltip, InputGroup, InputLeftElement,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, formatDate } from '../../lib/utils';
import api from '../../services/api';
import { Expense, ExpenseCategory, PaginatedResponse } from '../../types';
import { useState, useRef, useMemo } from 'react';

interface ParsedTxn {
  date: string;
  description: string;
  amount_paise: number;
  is_debit: boolean;
  type: 'expense' | 'atm' | 'transfer_out' | 'transfer_in' | 'income';
  category_name: string | null;
  _selected: boolean;
  _cat: string;
}
interface ParseResult {
  bank_detected: string | null;
  total_rows: number;
  transactions: ParsedTxn[];
  summary: Record<string, number>;
}
const TYPE_META: Record<string, { label: string; color: string; icon: string; importable: boolean }> = {
  expense:      { label: 'Expense',        color: 'red',    icon: '💸', importable: true  },
  atm:          { label: 'ATM Cash',       color: 'orange', icon: '🏧', importable: true  },
  loan_emi:     { label: 'Loan EMI',       color: 'purple', icon: '🏦', importable: true  },
  cc_payment:   { label: 'CC Payment',     color: 'gray',   icon: '💳', importable: false },
  transfer_out: { label: 'Transfer Out',   color: 'blue',   icon: '➡️', importable: true  },
  transfer_in:  { label: 'Transfer In',    color: 'green',  icon: '⬅️', importable: false },
  income:       { label: 'Income',         color: 'green',  icon: '💰', importable: true  },
};

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

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(todayStr);

  // Import statement state
  const stmtDisc = useDisclosure();
  const [step,         setStep]        = useState<1 | 2 | 3>(1);
  const [stmtFile,     setStmtFile]    = useState<File | null>(null);
  const [stmtPwd,      setStmtPwd]     = useState('');
  const [parsing,      setParsing]     = useState(false);
  const [parseResult,  setParseResult] = useState<ParseResult | null>(null);
  const [txns,         setTxns]        = useState<ParsedTxn[]>([]);
  const [filterType,   setFilterType]  = useState<string>('all');
  const [importing,    setImporting]   = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; expenses_imported: number; income_imported: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: categories } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expenses/categories').then(r => r.data),
  });

  const { data: expenses, isLoading } = useQuery<PaginatedResponse<Expense>>({
    queryKey: ['expenses', fromDate, toDate],
    queryFn: () =>
      api.get('/expenses', { params: { from_date: fromDate, to_date: toDate, limit: 1000 } }).then(r => r.data),
  });

  const rangeTotal = expenses?.data.reduce((sum, e) => sum + e.amount, 0) ?? 0;

  // Client-side filters
  const [filterCat, setFilterCat]     = useState('all');
  const [searchTerm, setSearchTerm]   = useState('');

  const filteredExpenses = useMemo(() => {
    let data = expenses?.data ?? [];
    if (filterCat !== 'all') data = data.filter(e => String(e.category_id) === filterCat);
    if (searchTerm) data = data.filter(e =>
      e.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return data;
  }, [expenses?.data, filterCat, searchTerm]);

  // Category breakdown for donut chart
  const categoryData = useMemo(() => {
    const map: Record<string, { name: string; value: number; color: string }> = {};
    for (const exp of (expenses?.data ?? [])) {
      const name  = exp.category?.name  ?? 'Other';
      const color = exp.category?.color ?? '#868E96';
      if (!map[name]) map[name] = { name, value: 0, color };
      map[name].value += exp.amount;
    }
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [expenses?.data]);

  // Daily spending for bar chart
  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of (expenses?.data ?? [])) {
      map[exp.date] = (map[exp.date] ?? 0) + exp.amount;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date: date.slice(5), total: Math.round(total / 100) }));
  }, [expenses?.data]);

  const topCategory = categoryData[0];

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

  const openStmt = () => {
    setStep(1); setStmtFile(null); setStmtPwd('');
    setParseResult(null); setTxns([]); setImportResult(null); setFilterType('all');
    stmtDisc.onOpen();
  };

  const handleParseStatement = async () => {
    if (!stmtFile) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', stmtFile);
      fd.append('password', stmtPwd);
      const { data } = await api.post<ParseResult>('/expenses/parse-statement', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setParseResult(data);
      setTxns(data.transactions.map(t => ({
        ...t,
        _selected: TYPE_META[t.type]?.importable ?? false,
        _cat:      t.category_name ?? 'Miscellaneous',
      })));
      setStep(2);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not parse statement.';
      toast({ title: msg, status: 'error', duration: 5000 });
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    const selected = txns.filter(t => t._selected);
    if (!selected.length) { toast({ title: 'Select at least one row', status: 'warning', duration: 2000 }); return; }
    setImporting(true);
    try {
      const { data } = await api.post('/expenses/import-statement', {
        rows: selected.map(t => ({
          date:          t.date,
          description:   t.description,
          amount_paise:  t.amount_paise,
          type:          t.type,
          category_name: t.type === 'expense' ? t._cat : null,
        })),
      });
      setImportResult(data);
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-total'] });
      setStep(3);
    } catch {
      toast({ title: 'Import failed', status: 'error', duration: 3000 });
    } finally {
      setImporting(false);
    }
  };

  const toggleRow    = (idx: number) => setTxns(prev => prev.map((t, i) => i === idx ? { ...t, _selected: !t._selected } : t));
  const setCat       = (idx: number, cat: string) => setTxns(prev => prev.map((t, i) => i === idx ? { ...t, _cat: cat } : t));
  const selectAll    = (val: boolean) => setTxns(prev => prev.map(t => TYPE_META[t.type]?.importable ? { ...t, _selected: val } : t));

  const visibleTxns  = filterType === 'all' ? txns : txns.filter(t => t.type === filterType);
  const selectedCount = txns.filter(t => t._selected).length;
  const selectedTotal = txns.filter(t => t._selected).reduce((s, t) => s + t.amount_paise, 0);
  const importableCount = txns.filter(t => TYPE_META[t.type]?.importable).length;

  const onSubmit = (data: ExpenseForm) => {
    createMutation.mutate({
      category_id: parseInt(data.category_id),
      date: data.date,
      amount: Math.round(parseFloat(data.amount) * 100),
      description: data.description || null,
      payment_method: data.payment_method || null,
    });
  };


  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Box>
            <Heading size="lg">Expenses</Heading>
            <Text color="gray.500" fontSize="sm">Track your spending</Text>
          </Box>
          <HStack spacing={2}>
            <Button size="sm" variant="outline" colorScheme="purple" onClick={openStmt}>
              📤 Import Statement
            </Button>
            <GradientButton onClick={onOpen} size="sm">+ Add Expense</GradientButton>
          </HStack>
        </HStack>

        {/* Date Range + Filters */}
        <HStack spacing={3} flexWrap="wrap">
          <HStack spacing={2}>
            <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">From</Text>
            <Input type="date" size="sm" w="150px" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </HStack>
          <HStack spacing={2}>
            <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">To</Text>
            <Input type="date" size="sm" w="150px" value={toDate} onChange={e => setToDate(e.target.value)} />
          </HStack>
          <Select size="sm" w="160px" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="all">All Categories</option>
            {categories?.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </Select>
          <InputGroup size="sm" w="200px">
            <InputLeftElement pointerEvents="none">
              <Text fontSize="xs" color="gray.400">🔍</Text>
            </InputLeftElement>
            <Input
              placeholder="Search description…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </InputGroup>
        </HStack>

        {/* Stats */}
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Spent</StatLabel>
              <StatNumber fontSize="lg" color="red.500">
                {expenses ? formatINR(rangeTotal) : '—'}
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
              <StatLabel fontSize="xs" color="gray.500">Avg / Transaction</StatLabel>
              <StatNumber fontSize="lg">
                {expenses?.total && rangeTotal
                  ? formatINR(Math.round(rangeTotal / expenses.total))
                  : '—'}
              </StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Top Category</StatLabel>
              <StatNumber fontSize="md" isTruncated>
                {topCategory ? (
                  <HStack spacing={1}>
                    <Text>{topCategory.name}</Text>
                  </HStack>
                ) : '—'}
              </StatNumber>
              {topCategory && (
                <Text fontSize="xs" color="red.400">{formatINR(topCategory.value)}</Text>
              )}
            </Stat>
          </GlassCard>
        </SimpleGrid>

        {/* Charts */}
        {(expenses?.data.length ?? 0) > 0 && (
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>

            {/* Donut — spending by category */}
            <GlassCard p={4}>
              <Text fontWeight="semibold" mb={3} fontSize="sm">Spending by Category</Text>
              <HStack align="center" spacing={4}>
                <Box w="160px" h="160px" flexShrink={0}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={75}
                        dataKey="value"
                        stroke="none"
                      >
                        {categoryData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <RTooltip
                        formatter={(val: number) => formatINR(val)}
                        contentStyle={{ fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
                <VStack align="stretch" spacing={1} flex={1} overflow="hidden">
                  {categoryData.map((c, i) => (
                    <HStack key={i} justify="space-between" fontSize="xs">
                      <HStack spacing={1} minW={0}>
                        <Box w="8px" h="8px" borderRadius="full" bg={c.color} flexShrink={0} />
                        <Text isTruncated color="gray.600" _dark={{ color: 'gray.300' }}>{c.name}</Text>
                      </HStack>
                      <Text fontWeight="semibold" flexShrink={0}>{formatINR(c.value)}</Text>
                    </HStack>
                  ))}
                </VStack>
              </HStack>
            </GlassCard>

            {/* Bar — daily spending */}
            <GlassCard p={4}>
              <Text fontWeight="semibold" mb={3} fontSize="sm">Daily Spending (₹)</Text>
              <Box h="180px">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} width={45}
                      tickFormatter={v => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)} />
                    <RTooltip
                      formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, 'Spent']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="#9F7AEA" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </GlassCard>

          </SimpleGrid>
        )}

        {/* Expense List */}
        <GlassCard p={0} overflow="hidden">
          {isLoading ? (
            <Box p={8} textAlign="center"><Spinner color="purple.500" /></Box>
          ) : filteredExpenses.length === 0 ? (
            <Box p={8} textAlign="center">
              <Text color="gray.500">No expenses for this period.</Text>
              <Button mt={3} size="sm" colorScheme="purple" variant="ghost" onClick={onOpen}>
                Add your first expense
              </Button>
            </Box>
          ) : (
            <>
              <HStack px={4} py={2} borderBottomWidth="1px" justify="space-between">
                <Text fontSize="xs" color="gray.500">
                  Showing {filteredExpenses.length} of {expenses?.total ?? 0} transactions
                </Text>
              </HStack>
              <TableContainer>
                <Table size="sm">
                  <Thead bg="gray.50" _dark={{ bg: 'gray.700' }}>
                    <Tr>
                      <Th>Date</Th>
                      <Th>Category</Th>
                      <Th>Description</Th>
                      <Th isNumeric>Amount</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filteredExpenses.map(exp => (
                      <Tr key={exp.id} _hover={{ bg: 'gray.50' }} _dark={{ _hover: { bg: 'gray.750' } }}>
                        <Td fontSize="xs" color="gray.500" whiteSpace="nowrap">{formatDate(exp.date)}</Td>
                        <Td>
                          <HStack spacing={1} flexWrap="wrap">
                            <Badge
                              fontSize="xs" variant="subtle"
                              style={{ backgroundColor: exp.category?.color ? exp.category.color + '30' : undefined,
                                       color: exp.category?.color ?? '#805AD5' }}
                            >
                              {exp.category?.name ?? 'Other'}
                            </Badge>
                            {exp.tags?.filter(t => ['transfer','atm','loan','emi','credit-card'].includes(t)).map(t => (
                              <Badge key={t} colorScheme="blue" variant="outline" fontSize="xs">{t}</Badge>
                            ))}
                          </HStack>
                        </Td>
                        <Td fontSize="sm" maxW="240px" isTruncated>
                          <Tooltip label={exp.description ?? ''} placement="top" hasArrow>
                            <Text isTruncated>{exp.description ?? '—'}</Text>
                          </Tooltip>
                        </Td>
                        <Td isNumeric fontWeight="semibold" color="red.500" whiteSpace="nowrap">
                          {formatINR(exp.amount)}
                        </Td>
                        <Td>
                          <IconButton
                            aria-label="Delete"
                            icon={<Text fontSize="xs">✕</Text>}
                            size="xs" variant="ghost" colorScheme="red"
                            onClick={() => deleteMutation.mutate(exp.id)}
                          />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            </>
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

      {/* ── Import Statement Modal ── */}
      <Modal isOpen={stmtDisc.isOpen} onClose={stmtDisc.onClose} size="5xl" scrollBehavior="inside">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent maxH="90vh">
          <ModalHeader>
            <HStack spacing={3}>
              <Text>📤 Import Bank Statement</Text>
              <HStack spacing={1}>
                {[1,2,3].map(s => (
                  <Box key={s} w="24px" h="24px" borderRadius="full" fontSize="xs"
                    display="flex" alignItems="center" justifyContent="center" fontWeight="bold"
                    bg={step >= s ? 'purple.500' : 'gray.200'} color={step >= s ? 'white' : 'gray.500'}>
                    {s}
                  </Box>
                ))}
              </HStack>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>

            {/* STEP 1: Upload */}
            {step === 1 && (
              <VStack spacing={5} align="stretch" py={2}>
                <Alert status="info" borderRadius="lg" fontSize="sm">
                  <AlertIcon />
                  Upload your bank statement PDF. Transactions are auto-classified into Expenses, ATM Withdrawals, and Transfers — you review before importing.
                </Alert>
                <Box
                  border="2px dashed" borderColor="purple.300" borderRadius="xl" p={8}
                  textAlign="center" cursor="pointer" _hover={{ bg: 'purple.50', _dark: { bg: 'purple.900' } }}
                  onClick={() => fileRef.current?.click()} transition="background 0.15s"
                >
                  <Text fontSize="3xl" mb={2}>📄</Text>
                  <Text fontWeight="semibold">{stmtFile ? stmtFile.name : 'Click to upload bank statement PDF'}</Text>
                  <Text fontSize="xs" color="gray.400" mt={1}>
                    Supports PDF, XLS, XLSX · HDFC, ICICI, SBI, Axis, Kotak, Yes Bank · Max 20 MB
                  </Text>
                  <input
                    ref={fileRef} type="file" accept=".pdf,.xls,.xlsx" style={{ display: 'none' }}
                    onChange={e => setStmtFile(e.target.files?.[0] ?? null)}
                  />
                </Box>
                <FormControl>
                  <FormLabel fontSize="sm">PDF Password (if protected)</FormLabel>
                  <Input
                    placeholder="Usually DOB e.g. 01011990 or PAN number"
                    value={stmtPwd} onChange={e => setStmtPwd(e.target.value)}
                    type="password" size="sm"
                  />
                  <Text fontSize="10px" color="gray.400" mt={1}>
                    Password is used only to decrypt the PDF and is never stored or sent anywhere.
                  </Text>
                </FormControl>
              </VStack>
            )}

            {/* STEP 2: Review */}
            {step === 2 && parseResult && (
              <VStack spacing={4} align="stretch">
                {/* Type filter chips */}
                <HStack flexWrap="wrap" gap={2}>
                  <Button size="xs" variant={filterType === 'all' ? 'solid' : 'outline'} colorScheme="purple"
                    onClick={() => setFilterType('all')}>All ({txns.length})</Button>
                  {Object.entries(parseResult.summary).filter(([,v]) => v > 0).map(([type, count]) => {
                    const m = TYPE_META[type];
                    return (
                      <Button key={type} size="xs"
                        variant={filterType === type ? 'solid' : 'outline'}
                        colorScheme={m?.color ?? 'gray'}
                        onClick={() => setFilterType(filterType === type ? 'all' : type)}>
                        {m?.icon} {m?.label} ({count})
                      </Button>
                    );
                  })}
                </HStack>

                {/* Select all bar */}
                <HStack bg="purple.50" _dark={{ bg: 'purple.900' }} p={3} borderRadius="lg" justify="space-between" flexWrap="wrap" gap={2}>
                  <HStack>
                    <Checkbox
                      isChecked={selectedCount === importableCount && importableCount > 0}
                      isIndeterminate={selectedCount > 0 && selectedCount < importableCount}
                      onChange={e => selectAll(e.target.checked)} colorScheme="purple"
                    >
                      <Text fontSize="sm">Select all importable</Text>
                    </Checkbox>
                    <Badge colorScheme="purple">{selectedCount} selected</Badge>
                  </HStack>
                  <Text fontSize="sm" fontWeight="semibold">Total: {formatINR(selectedTotal)}</Text>
                </HStack>

                {/* Transaction table */}
                <Box overflowX="auto" maxH="45vh" overflowY="auto" borderRadius="lg" border="1px solid" borderColor="gray.200" _dark={{ borderColor: 'gray.600' }}>
                  <Table size="xs">
                    <Thead bg="gray.50" _dark={{ bg: 'gray.700' }} position="sticky" top={0} zIndex={1}>
                      <Tr>
                        <Th w="32px"></Th>
                        <Th>Date</Th>
                        <Th>Description</Th>
                        <Th>Type</Th>
                        <Th>Category</Th>
                        <Th isNumeric>Amount</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {visibleTxns.map((txn) => {
                        const realIdx = txns.indexOf(txn);
                        const meta    = TYPE_META[txn.type];
                        const canImport = meta?.importable ?? false;
                        return (
                          <Tr key={realIdx}
                            bg={txn._selected ? 'purple.50' : undefined}
                            _dark={{ bg: txn._selected ? 'purple.900' : undefined }}
                            opacity={canImport ? 1 : 0.45}
                          >
                            <Td>
                              <Checkbox isChecked={txn._selected} isDisabled={!canImport}
                                onChange={() => toggleRow(realIdx)} colorScheme="purple" size="sm" />
                            </Td>
                            <Td fontSize="xs" color="gray.500" whiteSpace="nowrap">{txn.date}</Td>
                            <Td fontSize="xs" maxW="200px">
                              <Tooltip label={txn.description} placement="top">
                                <Text noOfLines={1}>{txn.description}</Text>
                              </Tooltip>
                            </Td>
                            <Td>
                              <Badge colorScheme={meta?.color ?? 'gray'} fontSize="9px" variant="subtle">
                                {meta?.icon} {meta?.label}
                              </Badge>
                            </Td>
                            <Td minW="130px">
                              {txn.type === 'expense' ? (
                                <Select size="xs" value={txn._cat}
                                  onChange={e => setCat(realIdx, e.target.value)}
                                  isDisabled={!txn._selected}>
                                  {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </Select>
                              ) : (
                                <Text fontSize="xs" color="gray.400">
                                  {txn.type === 'atm' ? 'ATM (auto-tagged)' :
                                   txn.type === 'transfer_out' ? 'Transfer (auto-tagged)' : 'Not imported'}
                                </Text>
                              )}
                            </Td>
                            <Td isNumeric fontWeight="semibold" fontSize="xs"
                              color={txn.is_debit ? 'red.500' : 'green.500'}>
                              {txn.is_debit ? '-' : '+'}{formatINR(txn.amount_paise)}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </Box>
                <Text fontSize="10px" color="gray.400">
                  Transfer In and Income rows are shown for reference only and cannot be imported as expenses.
                </Text>
              </VStack>
            )}

            {/* STEP 3: Done */}
            {step === 3 && importResult && (
              <VStack spacing={5} align="center" py={8}>
                <Text fontSize="5xl">✅</Text>
                <Heading size="md">Import Complete!</Heading>
                <SimpleGrid columns={3} spacing={3} w="100%" maxW="420px">
                  <Box p={3} bg="red.50" _dark={{ bg: 'red.900' }} borderRadius="xl" textAlign="center">
                    <Text fontSize="2xl" fontWeight="black" color="red.500">{importResult.expenses_imported}</Text>
                    <Text fontSize="xs" color="gray.500">Expenses</Text>
                  </Box>
                  <Box p={3} bg="green.50" _dark={{ bg: 'green.900' }} borderRadius="xl" textAlign="center">
                    <Text fontSize="2xl" fontWeight="black" color="green.600">{importResult.income_imported}</Text>
                    <Text fontSize="xs" color="gray.500">Income</Text>
                  </Box>
                  <Box p={3} bg="gray.50" _dark={{ bg: 'gray.700' }} borderRadius="xl" textAlign="center">
                    <Text fontSize="2xl" fontWeight="black" color="gray.500">{importResult.skipped}</Text>
                    <Text fontSize="xs" color="gray.500">Skipped</Text>
                  </Box>
                </SimpleGrid>
                <Text fontSize="sm" color="gray.500" textAlign="center">
                  Your expense list has been updated. ATM withdrawals and transfers are tagged automatically.
                </Text>
              </VStack>
            )}

          </ModalBody>
          <ModalFooter gap={2}>
            {step === 1 && (
              <>
                <Button variant="ghost" onClick={stmtDisc.onClose} size="sm">Cancel</Button>
                <GradientButton size="sm" isDisabled={!stmtFile} isLoading={parsing} onClick={handleParseStatement}>
                  Parse Statement →
                </GradientButton>
              </>
            )}
            {step === 2 && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← Back</Button>
                <GradientButton size="sm" isDisabled={selectedCount === 0} isLoading={importing} onClick={handleImport}>
                  Import {selectedCount} transaction{selectedCount !== 1 ? 's' : ''} ({formatINR(selectedTotal)})
                </GradientButton>
              </>
            )}
            {step === 3 && (
              <GradientButton size="sm" onClick={stmtDisc.onClose}>Done</GradientButton>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}
