import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber,
  Button, IconButton, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton, FormControl, FormLabel, Input,
  Select, Textarea, useDisclosure, useToast, Spinner, Badge, Table, Thead,
  Tbody, Tr, Th, Td, TableContainer, NumberInput, NumberInputField,
  Progress, Alert, AlertIcon, Divider, Tooltip,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, formatDate } from '../../lib/utils';
import api from '../../services/api';
import { Income, DeductionItem, PaginatedResponse } from '../../types';
import { useState, useRef } from 'react';

interface IncomeForm {
  source_type: string;
  date: string;
  amount: string;
  description: string;
}

interface Deduction {
  label:        string;
  amount_paise: number;
}

interface ParsedSlip {
  net_pay_paise:          number | null;
  gross_pay_paise:        number | null;
  total_deductions_paise: number | null;
  deductions:             Deduction[];
  pay_date:               string | null;
  employer:               string | null;
  employee:               string | null;
  filename:               string;
  error:                  string | null;
  // editable overrides
  _net:    string;
  _date:   string;
  _source: string;
  _desc:   string;
  _ok:     boolean;
  _showDed: boolean;
}

const SOURCE_COLORS: Record<string, string> = {
  salary: 'green', freelancing: 'blue', side_business: 'purple',
  rental: 'orange', dividend: 'teal', interest: 'cyan', bonus: 'yellow', other: 'gray',
};

function IncomeRow({ inc, onDelete }: { inc: Income; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const hasDeductions = inc.deductions && inc.deductions.length > 0;

  return (
    <>
      <Tr _hover={{ bg: 'gray.50' }} _dark={{ _hover: { bg: 'gray.700' } }}>
        <Td fontSize="xs" color="gray.500">
          {new Date(inc.date + 'T00:00:00').toLocaleString('en-IN', { month: 'short', year: 'numeric' })}
        </Td>
        <Td>
          <Badge colorScheme={SOURCE_COLORS[inc.source_type] ?? 'gray'} variant="subtle" fontSize="xs">
            {inc.source_type}
          </Badge>
        </Td>
        <Td fontSize="sm" maxW="220px">
          <Tooltip label={inc.description ?? ''} placement="top" hasArrow>
            <Text isTruncated>{inc.description ?? '—'}</Text>
          </Tooltip>
        </Td>
        <Td isNumeric>
          <VStack align="flex-end" spacing={0}>
            <Text fontWeight="semibold" color="green.500">{formatINR(inc.amount)}</Text>
            {inc.gross_pay_paise && (
              <Text fontSize="xs" color="gray.400">
                Gross {formatINR(inc.gross_pay_paise)}
              </Text>
            )}
          </VStack>
        </Td>
        <Td>
          <HStack spacing={1} justify="flex-end">
            {hasDeductions && (
              <Button size="xs" variant="ghost" colorScheme="orange"
                onClick={() => setOpen(o => !o)}>
                {open ? '▲' : `🔻 ${inc.deductions.length}`}
              </Button>
            )}
            <IconButton
              aria-label="Delete" icon={<Text fontSize="xs">✕</Text>}
              size="xs" variant="ghost" colorScheme="red" onClick={onDelete}
            />
          </HStack>
        </Td>
      </Tr>

      {open && hasDeductions && (
        <Tr>
          <Td colSpan={5} p={0} borderBottom="none">
            <Box
              bg="orange.50" _dark={{ bg: 'orange.900' }}
              px={6} py={3} borderBottomWidth="1px"
            >
              <Text fontSize="xs" fontWeight="bold" color="orange.700" mb={2}>
                Deductions breakdown
              </Text>
              <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={2}>
                {inc.deductions.map((d: DeductionItem, i: number) => (
                  <HStack key={i} justify="space-between" fontSize="xs"
                    bg="white" _dark={{ bg: 'gray.800' }} px={3} py={1.5} borderRadius="md">
                    <Text color="gray.600" _dark={{ color: 'gray.300' }}>{d.label}</Text>
                    <Text fontWeight="semibold" color="orange.600">− {formatINR(d.amount_paise)}</Text>
                  </HStack>
                ))}
              </SimpleGrid>
              {inc.total_deductions_paise && (
                <HStack justify="flex-end" mt={2} fontSize="xs" fontWeight="bold">
                  <Text color="gray.500">Total Deductions:</Text>
                  <Text color="orange.600">− {formatINR(inc.total_deductions_paise)}</Text>
                </HStack>
              )}
            </Box>
          </Td>
        </Tr>
      )}
    </>
  );
}

export default function IncomePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const slipDisc = useDisclosure();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<IncomeForm>();

  const today = new Date();
  const [fromMonth,    setFromMonth]    = useState(1);
  const [fromYear,     setFromYear]     = useState(today.getFullYear());
  const [toMonth,      setToMonth]      = useState(today.getMonth() + 1);
  const [toYear,       setToYear]       = useState(today.getFullYear());
  const [filterSource, setFilterSource] = useState('');

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Compute ISO date range from selected month bounds
  const fromDateStr = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(toYear, toMonth, 0).getDate();
  const toDateStr = `${toYear}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Salary slip upload state
  const [slipStep,    setSlipStep]    = useState<1 | 2 | 3>(1);
  const [slips,       setSlips]       = useState<ParsedSlip[]>([]);
  const [parsing,     setParsing]     = useState(false);
  const [parseCount,  setParseCount]  = useState(0);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState<{ imported: number; skipped: number } | null>(null);
  const [deduping,      setDeduping]      = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: incomes, isLoading } = useQuery<PaginatedResponse<Income>>({
    queryKey: ['income', fromDateStr, toDateStr],
    queryFn: () =>
      api.get('/income', { params: { from_date: fromDateStr, to_date: toDateStr, limit: 500 } }).then(r => r.data),
  });

  const filteredIncomes = incomes?.data.filter(i =>
    filterSource ? i.source_type === filterSource : true
  ) ?? [];

  const rangeTotal = filteredIncomes.reduce((s, i) => s + i.amount, 0);

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/income', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income'] });
      toast({ title: 'Income added', status: 'success', duration: 2000 });
      reset(); onClose();
    },
    onError: () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/income/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['income'] });
      toast({ title: 'Income deleted', status: 'info', duration: 2000 });
    },
  });

  const handleCleanBankImports = async () => {
    setDeduping(true);
    try {
      const { data } = await api.delete('/income/remove-bank-imports');
      await qc.invalidateQueries({ queryKey: ['income'] });
      if (data.removed > 0) {
        toast({ title: `Removed ${data.removed} bank-statement income record${data.removed !== 1 ? 's' : ''}`, status: 'success', duration: 3000 });
      } else {
        toast({ title: 'Nothing to clean up', status: 'info', duration: 2000 });
      }
    } catch {
      toast({ title: 'Cleanup failed', status: 'error', duration: 3000 });
    } finally {
      setDeduping(false);
    }
  };

  const onSubmit = (data: IncomeForm) => {
    createMutation.mutate({
      source_type: data.source_type,
      date: data.date,
      amount: Math.round(parseFloat(data.amount) * 100),
      description: data.description || null,
    });
  };

  // ── salary slip handlers ────────────────────────────────────────────────────

  const openSlipModal = () => {
    setSlipStep(1); setSlips([]); setParseCount(0); setImportResult(null);
    slipDisc.onOpen();
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    setParseCount(0);
    const results: ParsedSlip[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fd = new FormData();
      fd.append('file', file);
      try {
        const { data } = await api.post('/income/parse-slip', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        results.push({
          ...data,
          _net:     data.net_pay_paise ? String(Math.round(data.net_pay_paise / 100)) : '',
          _date:    data.pay_date ?? '',
          _source:  'salary',
          _desc:    data.employer ?? '',
          _ok:      !data.error && !!data.net_pay_paise && !!data.pay_date,
          _showDed: false,
        });
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Parse failed';
        results.push({
          net_pay_paise: null, gross_pay_paise: null,
          total_deductions_paise: null, deductions: [],
          pay_date: null, employer: null, employee: null,
          filename: file.name, error: msg,
          _net: '', _date: '', _source: 'salary', _desc: '',
          _ok: false, _showDed: false,
        });
      }
      setParseCount(i + 1);
    }

    setSlips(results);
    setParsing(false);
    setSlipStep(2);
  };

  const updateSlip = (idx: number, field: string, value: string) =>
    setSlips(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));

  const toggleSlip    = (idx: number) =>
    setSlips(prev => prev.map((s, i) => i === idx ? { ...s, _ok: !s._ok } : s));

  const toggleDed = (idx: number) =>
    setSlips(prev => prev.map((s, i) => i === idx ? { ...s, _showDed: !s._showDed } : s));

  const handleImportSlips = async () => {
    const valid = slips.filter(s => s._ok && s._net && s._date);
    if (!valid.length) {
      toast({ title: 'No valid slips to import', status: 'warning', duration: 2000 });
      return;
    }
    setImporting(true);
    try {
      const { data } = await api.post('/income/import-slips', {
        slips: valid.map(s => ({
          net_pay_paise:          Math.round(parseFloat(s._net) * 100),
          gross_pay_paise:        s.gross_pay_paise ?? null,
          total_deductions_paise: s.total_deductions_paise ?? null,
          deductions:             s.deductions ?? [],
          pay_date:               s._date,
          employer:               s.employer ?? null,
          employee:               s.employee ?? null,
          description:            s._desc || null,
        })),
      });
      setImportResult(data);

      // Jump filter to imported slip's month so records are visible immediately
      const firstDate = valid[0]._date;
      if (firstDate) {
        const d = new Date(firstDate);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        setFromMonth(m); setFromYear(y);
        setToMonth(m);   setToYear(y);
      }

      await qc.invalidateQueries({ queryKey: ['income'] });

      // Close modal and show toast — user sees the list immediately
      slipDisc.onClose();
      const dupMsg = data.duplicate > 0 ? ` (${data.duplicate} already existed, skipped)` : '';
      toast({
        title: data.imported > 0
          ? `${data.imported} salary record${data.imported !== 1 ? 's' : ''} imported${dupMsg}`
          : `Already imported${dupMsg}`,
        status: data.imported > 0 ? 'success' : 'warning',
        duration: 4000,
      });
    } catch {
      toast({ title: 'Import failed', status: 'error', duration: 3000 });
    } finally {
      setImporting(false);
    }
  };

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Box>
            <Heading size="lg">Income</Heading>
            <Text color="gray.500" fontSize="sm">Track your earnings</Text>
          </Box>
          <HStack spacing={2}>
            <Button size="sm" variant="ghost" colorScheme="red" isLoading={deduping}
              onClick={handleCleanBankImports}>
              🧹 Clean Bank Imports
            </Button>
            <Button size="sm" variant="outline" colorScheme="green" onClick={openSlipModal}>
              📄 Upload Salary Slip
            </Button>
            <GradientButton onClick={onOpen} size="sm">+ Add Income</GradientButton>
          </HStack>
        </HStack>

        <HStack spacing={3} flexWrap="wrap" align="center">
          <HStack spacing={1}>
            <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">From</Text>
            <Select size="sm" w="88px" value={fromMonth}
              onChange={e => setFromMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </Select>
            <Select size="sm" w="90px" value={fromYear}
              onChange={e => setFromYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </HStack>
          <HStack spacing={1}>
            <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">To</Text>
            <Select size="sm" w="88px" value={toMonth}
              onChange={e => setToMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </Select>
            <Select size="sm" w="90px" value={toYear}
              onChange={e => setToYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </HStack>
          <Select size="sm" w="140px" value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            placeholder="All Sources">
            <option value="salary">Salary</option>
            <option value="bonus">Bonus</option>
            <option value="freelancing">Freelance</option>
            <option value="side_business">Side Business</option>
            <option value="rental">Rental</option>
            <option value="dividend">Dividend</option>
            <option value="interest">Interest</option>
            <option value="other">Other</option>
          </Select>
        </HStack>

        <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Income</StatLabel>
              <StatNumber fontSize="lg" color="green.500">
                {formatINR(rangeTotal)}
              </StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Transactions</StatLabel>
              <StatNumber fontSize="lg">{filteredIncomes.length}</StatNumber>
            </Stat>
          </GlassCard>
        </SimpleGrid>

        <GlassCard p={0} overflow="hidden">
          {isLoading ? (
            <Box p={8} textAlign="center"><Spinner color="purple.500" /></Box>
          ) : filteredIncomes.length === 0 ? (
            <Box p={8} textAlign="center">
              <Text color="gray.500">No income records for this period.</Text>
              <HStack justify="center" mt={3} spacing={3}>
                <Button size="sm" colorScheme="green" variant="ghost" onClick={onOpen}>
                  + Add manually
                </Button>
                <Button size="sm" colorScheme="green" variant="outline" onClick={openSlipModal}>
                  📄 Upload salary slip
                </Button>
              </HStack>
            </Box>
          ) : (
            <TableContainer>
              <Table size="sm">
                <Thead bg="gray.50" _dark={{ bg: 'gray.700' }}>
                  <Tr>
                    <Th>Month</Th>
                    <Th>Source</Th>
                    <Th>Description</Th>
                    <Th isNumeric>Amount</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredIncomes.map(inc => (
                    <IncomeRow
                      key={inc.id}
                      inc={inc}
                      onDelete={() => deleteMutation.mutate(inc.id)}
                    />
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          )}
        </GlassCard>
      </VStack>

      {/* ── Add Income Modal ─────────────────────────────────────────────────── */}
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
                  <option value="bonus">Bonus</option>
                  <option value="freelancing">Freelance</option>
                  <option value="side_business">Side Business</option>
                  <option value="rental">Rental</option>
                  <option value="dividend">Dividend</option>
                  <option value="interest">Interest</option>
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

      {/* ── Salary Slip Upload Modal ─────────────────────────────────────────── */}
      <Modal isOpen={slipDisc.isOpen} onClose={slipDisc.onClose} size="3xl" scrollBehavior="inside">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            {slipStep === 1 && '📄 Upload Salary Slips'}
            {slipStep === 2 && `📋 Review Extracted Data (${slips.length} slip${slips.length !== 1 ? 's' : ''})`}
            {slipStep === 3 && '✅ Import Complete'}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>

            {/* STEP 1: File picker */}
            {slipStep === 1 && (
              <VStack spacing={5}>
                {parsing ? (
                  <VStack spacing={3} py={6} w="100%">
                    <Spinner size="lg" color="green.500" />
                    <Text fontSize="sm" color="gray.500">
                      Parsing file {parseCount} of {fileRef.current?.files?.length ?? '?'}…
                    </Text>
                    <Progress
                      size="sm" w="100%" colorScheme="green" isAnimated
                      value={fileRef.current?.files?.length
                        ? (parseCount / fileRef.current.files.length) * 100
                        : 0}
                    />
                  </VStack>
                ) : (
                  <Box
                    w="100%" border="2px dashed" borderColor="green.300"
                    borderRadius="xl" p={10} textAlign="center" cursor="pointer"
                    _hover={{ borderColor: 'green.500', bg: 'green.50' }}
                    _dark={{ _hover: { bg: 'green.900' } }}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Text fontSize="4xl" mb={2}>📄</Text>
                    <Text fontWeight="semibold" mb={1}>Drop salary slip PDFs here</Text>
                    <Text fontSize="sm" color="gray.500">
                      or click to browse — you can select multiple files at once
                    </Text>
                    <Text fontSize="xs" color="gray.400" mt={2}>
                      Supports: Zoho Payroll, GreytHR, Keka, Darwinbox, government payslips, custom formats
                    </Text>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf"
                      multiple
                      hidden
                      onChange={e => handleFilesSelected(e.target.files)}
                    />
                  </Box>
                )}
              </VStack>
            )}

            {/* STEP 2: Review extracted data */}
            {slipStep === 2 && (
              <VStack spacing={4} align="stretch">
                <Text fontSize="sm" color="gray.500">
                  Review and edit the extracted values. Uncheck any slip you don't want to import.
                </Text>
                {slips.map((slip, idx) => (
                  <GlassCard key={idx} p={4} borderLeftWidth="4px"
                    borderLeftColor={slip.error ? 'red.400' : slip._ok ? 'green.400' : 'gray.300'}>
                    <HStack justify="space-between" mb={2}>
                      <HStack spacing={2}>
                        <input
                          type="checkbox"
                          checked={slip._ok}
                          disabled={!!slip.error}
                          onChange={() => toggleSlip(idx)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <Text fontWeight="semibold" fontSize="sm" isTruncated maxW="300px">
                          {slip.filename}
                        </Text>
                      </HStack>
                      {slip.error ? (
                        <Badge colorScheme="red" fontSize="xs">Parse Error</Badge>
                      ) : (
                        <Badge colorScheme="green" fontSize="xs">Parsed</Badge>
                      )}
                    </HStack>

                    {slip.error ? (
                      <Alert status="error" size="sm" borderRadius="md">
                        <AlertIcon />
                        <Text fontSize="xs">{slip.error}</Text>
                      </Alert>
                    ) : (
                      <VStack spacing={3} align="stretch">
                        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                          <FormControl>
                            <FormLabel fontSize="xs" color="gray.500">Net Pay (₹)</FormLabel>
                            <Input
                              size="sm" type="number" value={slip._net}
                              onChange={e => updateSlip(idx, '_net', e.target.value)}
                              isInvalid={!slip._net}
                            />
                            {slip.gross_pay_paise && (
                              <Text fontSize="xs" color="gray.400" mt={0.5}>
                                Gross: {formatINR(slip.gross_pay_paise)}
                              </Text>
                            )}
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="xs" color="gray.500">Pay Date</FormLabel>
                            <Input
                              size="sm" type="date" value={slip._date}
                              onChange={e => updateSlip(idx, '_date', e.target.value)}
                              isInvalid={!slip._date}
                            />
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="xs" color="gray.500">Source</FormLabel>
                            <Select size="sm" value={slip._source}
                              onChange={e => updateSlip(idx, '_source', e.target.value)}>
                              <option value="salary">Salary</option>
                              <option value="bonus">Bonus</option>
                              <option value="freelancing">Freelance</option>
                              <option value="other">Other</option>
                            </Select>
                          </FormControl>
                          <FormControl>
                            <FormLabel fontSize="xs" color="gray.500">Description</FormLabel>
                            <Input
                              size="sm" value={slip._desc}
                              placeholder={slip.employer ?? 'e.g. Company name'}
                              onChange={e => updateSlip(idx, '_desc', e.target.value)}
                            />
                          </FormControl>
                          {slip.employee && (
                            <Text fontSize="xs" color="gray.400" gridColumn="1/-1">
                              Employee: {slip.employee}
                            </Text>
                          )}
                        </SimpleGrid>

                        {/* Deductions section */}
                        {(slip.deductions.length > 0 || slip.total_deductions_paise) && (
                          <>
                            <Divider />
                            <Box>
                              <HStack justify="space-between" mb={slip._showDed ? 2 : 0}>
                                <HStack spacing={2}>
                                  <Text fontSize="xs" fontWeight="semibold" color="orange.600">
                                    🔻 Deductions
                                  </Text>
                                  {slip.total_deductions_paise && (
                                    <Badge colorScheme="orange" fontSize="xs" variant="subtle">
                                      {formatINR(slip.total_deductions_paise)}
                                    </Badge>
                                  )}
                                </HStack>
                                {slip.deductions.length > 0 && (
                                  <Button
                                    size="xs" variant="ghost" colorScheme="orange"
                                    onClick={() => toggleDed(idx)}
                                  >
                                    {slip._showDed ? 'Hide' : `Show ${slip.deductions.length} items`}
                                  </Button>
                                )}
                              </HStack>

                              {slip._showDed && slip.deductions.length > 0 && (
                                <Box
                                  bg="orange.50" _dark={{ bg: 'orange.900' }}
                                  borderRadius="md" p={3}
                                >
                                  <VStack spacing={1} align="stretch">
                                    {slip.deductions.map((d, di) => (
                                      <HStack key={di} justify="space-between" fontSize="xs">
                                        <Text color="gray.600" _dark={{ color: 'gray.300' }}>
                                          {d.label}
                                        </Text>
                                        <Text fontWeight="semibold" color="orange.600">
                                          − {formatINR(d.amount_paise)}
                                        </Text>
                                      </HStack>
                                    ))}
                                    {slip.total_deductions_paise && (
                                      <>
                                        <Divider borderColor="orange.200" />
                                        <HStack justify="space-between" fontSize="xs" fontWeight="bold">
                                          <Text>Total Deductions</Text>
                                          <Text color="orange.600">
                                            − {formatINR(slip.total_deductions_paise)}
                                          </Text>
                                        </HStack>
                                      </>
                                    )}
                                  </VStack>
                                </Box>
                              )}
                            </Box>
                          </>
                        )}
                      </VStack>
                    )}
                  </GlassCard>
                ))}
              </VStack>
            )}

            {/* STEP 3: Done */}
            {slipStep === 3 && importResult && (
              <VStack spacing={5} align="center" py={8}>
                <Text fontSize="5xl">✅</Text>
                <Heading size="md">Slips Imported!</Heading>
                <SimpleGrid columns={2} spacing={4} w="100%" maxW="300px">
                  <Box p={4} bg="green.50" _dark={{ bg: 'green.900' }} borderRadius="xl" textAlign="center">
                    <Text fontSize="3xl" fontWeight="black" color="green.600">{importResult.imported}</Text>
                    <Text fontSize="sm" color="gray.500">Imported</Text>
                  </Box>
                  <Box p={4} bg="gray.50" _dark={{ bg: 'gray.700' }} borderRadius="xl" textAlign="center">
                    <Text fontSize="3xl" fontWeight="black" color="gray.500">{importResult.skipped}</Text>
                    <Text fontSize="sm" color="gray.500">Skipped</Text>
                  </Box>
                </SimpleGrid>
                <Text fontSize="sm" color="gray.500">
                  Salary records are now visible in your Income list.
                </Text>
              </VStack>
            )}

          </ModalBody>
          <ModalFooter gap={2}>
            {slipStep === 1 && (
              <Button variant="ghost" size="sm" onClick={slipDisc.onClose}>Cancel</Button>
            )}
            {slipStep === 2 && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setSlipStep(1)}>← Back</Button>
                <Text fontSize="xs" color="gray.400" flex={1}>
                  {slips.filter(s => s._ok).length} of {slips.length} selected
                </Text>
                <GradientButton
                  size="sm" isLoading={importing}
                  onClick={handleImportSlips}
                >
                  Import {slips.filter(s => s._ok).length} Slip{slips.filter(s => s._ok).length !== 1 ? 's' : ''}
                </GradientButton>
              </>
            )}
            {slipStep === 3 && (
              <GradientButton size="sm" onClick={slipDisc.onClose}>Done</GradientButton>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}
