import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Badge, Button, IconButton,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, Input, NumberInput, NumberInputField, Select, Textarea,
  useDisclosure, useToast, Spinner, Progress, Stat, StatLabel, StatNumber,
  Table, Thead, Tbody, Tr, Th, Td, TableContainer, Divider, Tooltip, Checkbox,
  AlertDialog, AlertDialogBody, AlertDialogFooter, AlertDialogHeader,
  AlertDialogContent, AlertDialogOverlay, Switch, Tag, Wrap, WrapItem,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useState, useRef } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, formatDate } from '../../lib/utils';
import api from '../../services/api';
import { CreditCard, CreditCardTransaction } from '../../types';

// ── helpers ──────────────────────────────────────────────────────────────────

const BANK_GRADIENTS: Record<string, string> = {
  hdfc: 'linear(to-br, #004c97, #0070cc)',
  sbi:  'linear(to-br, #1a3c8f, #2563eb)',
  icici:'linear(to-br, #c8102e, #f87171)',
  axis: 'linear(to-br, #97144d, #e84393)',
  kotak:'linear(to-br, #e61e25, #f87171)',
  yes:  'linear(to-br, #004987, #3b82f6)',
  idfc: 'linear(to-br, #f58220, #fbbf24)',
  amex: 'linear(to-br, #016fd0, #60a5fa)',
};

function cardGradient(bankName: string): string {
  const key = bankName.toLowerCase().split(' ')[0];
  return BANK_GRADIENTS[key] ?? 'linear(to-br, #4f46e5, #7c3aed)';
}

function utilizationColor(pct: number): string {
  if (pct >= 90) return 'red';
  if (pct >= 70) return 'orange';
  if (pct >= 40) return 'yellow';
  return 'green';
}

// ── form types ───────────────────────────────────────────────────────────────

interface CardForm {
  card_name: string;
  bank_name: string;
  last4_digits: string;
  credit_limit: string;
  outstanding_balance: string;
  due_date: string;
  minimum_due: string;
  interest_rate: string;
  rewards_points: string;
}

interface ParsedStatement {
  statement_date: string | null;
  due_date: string | null;
  due_day: number | null;
  total_due_paise: number | null;
  min_due_paise: number | null;
  credit_limit_paise: number | null;
  transactions: Array<{
    date: string;
    description: string;
    amount_paise: number;
    is_credit: boolean;
    selected?: boolean;
  }>;
}

interface SmsResult {
  amount_paise: number | null;
  last4: string | null;
  merchant: string | null;
  date: string | null;
  is_payment: boolean;
  bank_name: string | null;
  available_paise: number | null;
  raw: string;
  confidence: 'high' | 'medium' | 'low';
  // added by frontend after card matching:
  card_id?: number;
  selected?: boolean;
}

interface CardSummary {
  id: number;
  last4: string;
  bank_name: string;
  card_name: string;
}

interface TxnForm {
  amount: string;
  description: string;
  date: string;
  is_payment: boolean;
}

// ── component ────────────────────────────────────────────────────────────────

export default function CreditCardsPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const { isOpen: isFormOpen,   onOpen: onFormOpen,   onClose: onFormClose   } = useDisclosure();
  const { isOpen: isTxnOpen,    onOpen: onTxnOpen,    onClose: onTxnClose    } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const { isOpen: isPayOpen,    onOpen: onPayOpen,    onClose: onPayClose    } = useDisclosure();
  const { isOpen: isStmtOpen,   onOpen: onStmtOpen,  onClose: onStmtClose   } = useDisclosure();
  const { isOpen: isSmsOpen,    onOpen: onSmsOpen,   onClose: onSmsClose    } = useDisclosure();

  const cancelRef = useRef<HTMLButtonElement>(null);

  const [editingCard, setEditingCard]   = useState<CreditCard | null>(null);
  const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
  const [deleteCard, setDeleteCard]     = useState<CreditCard | null>(null);
  const [payCard, setPayCard]           = useState<CreditCard | null>(null);
  const [payAmount, setPayAmount]       = useState('');
  const [payDate, setPayDate]           = useState('');
  const [txnMonth, setTxnMonth]         = useState(new Date().getMonth() + 1);
  const [txnYear, setTxnYear]           = useState(new Date().getFullYear());
  const [stmtCard, setStmtCard]         = useState<CreditCard | null>(null);
  const [stmtFile, setStmtFile]         = useState<File | null>(null);
  const [stmtPassword, setStmtPassword] = useState('');
  const [stmtParsed, setStmtParsed]     = useState<ParsedStatement | null>(null);
  const [stmtParsing, setStmtParsing]   = useState(false);
  const [smsText, setSmsText]           = useState('');
  const [smsParsing, setSmsParsing]     = useState(false);
  const [smsResults, setSmsResults]     = useState<SmsResult[]>([]);
  const [smsCards, setSmsCards]         = useState<CardSummary[]>([]);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<CardForm>();
  const txnForm = useForm<TxnForm>({ defaultValues: { date: new Date().toISOString().split('T')[0], is_payment: false } });

  // ── queries ──

  const { data: cards, isLoading } = useQuery<CreditCard[]>({
    queryKey: ['credit-cards'],
    queryFn: () => api.get('/credit-cards').then(r => r.data),
  });

  const { data: transactions, isLoading: txnLoading } = useQuery<CreditCardTransaction[]>({
    queryKey: ['cc-transactions', selectedCard?.id, txnMonth, txnYear],
    queryFn: () => api.get(`/credit-cards/${selectedCard!.id}/transactions`, {
      params: { month: txnMonth, year: txnYear },
    }).then(r => r.data),
    enabled: !!selectedCard && isTxnOpen,
  });

  // ── mutations ──

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/credit-cards', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-cards'] }); toast({ title: 'Card added', status: 'success', duration: 2000 }); closeForm(); },
    onError:   () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => api.put(`/credit-cards/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-cards'] }); toast({ title: 'Card updated', status: 'success', duration: 2000 }); closeForm(); },
    onError:   () => toast({ title: 'Failed to update', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/credit-cards/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-cards'] }); toast({ title: 'Card deleted', status: 'info', duration: 2000 }); onDeleteClose(); },
    onError:   () => toast({ title: 'Failed to delete', status: 'error', duration: 3000 }),
  });

  const addTxnMutation = useMutation({
    mutationFn: ({ cardId, data }: { cardId: number; data: object }) =>
      api.post(`/credit-cards/${cardId}/transactions`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] });
      qc.invalidateQueries({ queryKey: ['cc-transactions', selectedCard?.id] });
      toast({ title: 'Transaction added', status: 'success', duration: 2000 });
      txnForm.reset({ date: new Date().toISOString().split('T')[0], is_payment: false });
    },
    onError: () => toast({ title: 'Failed to add transaction', status: 'error', duration: 3000 }),
  });

  const deleteTxnMutation = useMutation({
    mutationFn: ({ cardId, txnId }: { cardId: number; txnId: number }) =>
      api.delete(`/credit-cards/${cardId}/transactions/${txnId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] });
      qc.invalidateQueries({ queryKey: ['cc-transactions', selectedCard?.id] });
      toast({ title: 'Deleted', status: 'info', duration: 1500 });
    },
    onError: () => toast({ title: 'Failed to delete', status: 'error', duration: 3000 }),
  });

  const payBillMutation = useMutation({
    mutationFn: ({ cardId, amount, date }: { cardId: number; amount: number; date: string }) =>
      api.post(`/credit-cards/${cardId}/transactions`, { amount, date, is_payment: true, description: 'Bill payment' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] });
      qc.invalidateQueries({ queryKey: ['cc-transactions', payCard?.id] });
      toast({ title: 'Payment recorded. Outstanding reduced!', status: 'success', duration: 3000 });
      onPayClose();
      setPayAmount('');
    },
    onError: () => toast({ title: 'Failed to record payment', status: 'error', duration: 3000 }),
  });

  const applyStatementMutation = useMutation({
    mutationFn: ({ cardId, data }: { cardId: number; data: object }) =>
      api.post(`/credit-cards/${cardId}/apply-statement`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] });
      toast({ title: 'Statement applied! Card updated.', status: 'success', duration: 3000 });
      onStmtClose();
      setStmtParsed(null);
      setStmtFile(null);
      setStmtPassword('');
    },
    onError: () => toast({ title: 'Failed to apply statement', status: 'error', duration: 3000 }),
  });

  const handleParseStatement = async () => {
    if (!stmtCard || !stmtFile) return;
    setStmtParsing(true);
    try {
      const form = new FormData();
      form.append('file', stmtFile);
      if (stmtPassword) form.append('password', stmtPassword);
      const res = await api.post(`/credit-cards/${stmtCard.id}/parse-statement`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const parsed: ParsedStatement = { ...res.data, transactions: res.data.transactions.map((t: ParsedStatement['transactions'][0]) => ({ ...t, selected: true })) };
      setStmtParsed(parsed);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not parse statement';
      toast({ title: msg, status: 'error', duration: 5000 });
    } finally {
      setStmtParsing(false);
    }
  };

  const handleApplyStatement = () => {
    if (!stmtCard || !stmtParsed) return;
    applyStatementMutation.mutate({
      cardId: stmtCard.id,
      data: {
        total_due_paise: stmtParsed.total_due_paise,
        min_due_paise: stmtParsed.min_due_paise,
        due_day: stmtParsed.due_day,
        credit_limit_paise: stmtParsed.credit_limit_paise,
        transactions: stmtParsed.transactions.filter(t => t.selected),
      },
    });
  };

  const applySmsTransactionsMutation = useMutation({
    mutationFn: (txns: object[]) => api.post('/credit-cards/parse-sms/apply', { transactions: txns }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['credit-cards'] });
      toast({ title: `${res.data.added} transaction(s) added!`, status: 'success', duration: 3000 });
      onSmsClose();
      setSmsText('');
      setSmsResults([]);
    },
    onError: () => toast({ title: 'Failed to save transactions', status: 'error', duration: 3000 }),
  });

  const handleParseSms = async () => {
    if (!smsText.trim()) return;
    setSmsParsing(true);
    try {
      const res = await api.post('/credit-cards/parse-sms', { sms_text: smsText });
      const resultCards: CardSummary[] = res.data.cards;
      // Auto-match each result to a card by last4 + bank
      const matched: SmsResult[] = res.data.results.map((r: SmsResult) => {
        let card_id: number | undefined;
        if (r.last4) {
          const match = resultCards.find(c =>
            c.last4 === r.last4 &&
            (!r.bank_name || c.bank_name.toLowerCase().includes(r.bank_name.toLowerCase().split(' ')[0]))
          ) ?? resultCards.find(c => c.last4 === r.last4);
          card_id = match?.id;
        }
        // If only one card exists, auto-assign it
        if (!card_id && resultCards.length === 1) card_id = resultCards[0].id;
        return { ...r, card_id, selected: true };
      });
      setSmsResults(matched);
      setSmsCards(resultCards);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Could not parse SMS. Make sure you paste bank transaction messages.';
      toast({ title: msg, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setSmsParsing(false);
    }
  };

  const handleApplySms = () => {
    const toAdd = smsResults
      .filter(r => r.selected && r.card_id && r.amount_paise)
      .map(r => ({
        card_id: r.card_id,
        amount_paise: r.amount_paise,
        merchant: r.merchant,
        date: r.date,
        is_payment: r.is_payment,
      }));
    applySmsTransactionsMutation.mutate(toAdd);
  };

  const toggleSmsSelect = (idx: number) =>
    setSmsResults(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));

  const toggleTxnSelect = (idx: number) => {
    if (!stmtParsed) return;
    setStmtParsed(prev => prev ? {
      ...prev,
      transactions: prev.transactions.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t),
    } : null);
  };

  // ── handlers ──

  const openAdd = () => {
    setEditingCard(null);
    reset({ card_name: '', bank_name: '', last4_digits: '', credit_limit: '', outstanding_balance: '0', due_date: '', minimum_due: '0', interest_rate: '', rewards_points: '0' });
    onFormOpen();
  };

  const openEdit = (card: CreditCard) => {
    setEditingCard(card);
    reset({
      card_name: card.card_name,
      bank_name: card.bank_name,
      last4_digits: card.last4_digits,
      credit_limit: String(card.credit_limit / 100),
      outstanding_balance: String(card.outstanding_balance / 100),
      due_date: card.due_date ? String(card.due_date) : '',
      minimum_due: String(card.minimum_due / 100),
      interest_rate: card.interest_rate ? String(card.interest_rate) : '',
      rewards_points: String(card.rewards_points),
    });
    onFormOpen();
  };

  const closeForm = () => { onFormClose(); setEditingCard(null); };

  const onSubmit = (data: CardForm) => {
    const payload = {
      card_name: data.card_name,
      bank_name: data.bank_name,
      last4_digits: data.last4_digits,
      credit_limit: Math.round(parseFloat(data.credit_limit) * 100),
      outstanding_balance: Math.round(parseFloat(data.outstanding_balance || '0') * 100),
      due_date: data.due_date ? parseInt(data.due_date) : null,
      minimum_due: Math.round(parseFloat(data.minimum_due || '0') * 100),
      interest_rate: data.interest_rate ? parseFloat(data.interest_rate) : null,
      rewards_points: parseInt(data.rewards_points || '0'),
    };
    if (editingCard) {
      updateMutation.mutate({ id: editingCard.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openTransactions = (card: CreditCard) => {
    setSelectedCard(card);
    onTxnOpen();
  };

  const onAddTxn = (data: TxnForm) => {
    if (!selectedCard) return;
    addTxnMutation.mutate({
      cardId: selectedCard.id,
      data: {
        amount: Math.round(parseFloat(data.amount) * 100),
        description: data.description || null,
        date: data.date,
        is_payment: data.is_payment,
      },
    });
  };

  // ── summary totals ──

  const totalLimit       = cards?.reduce((s, c) => s + c.credit_limit, 0) ?? 0;
  const totalOutstanding = cards?.reduce((s, c) => s + c.outstanding_balance, 0) ?? 0;
  const totalMinDue      = cards?.reduce((s, c) => s + c.minimum_due, 0) ?? 0;
  const avgUtilization   = cards?.length ? Math.round(totalOutstanding / totalLimit * 100) : 0;

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>

        {/* ── Header ── */}
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Credit Cards</Heading>
            <Text color="gray.500" fontSize="sm">Track spending, utilization & bill payments</Text>
          </Box>
          <HStack>
            <Button size="sm" variant="outline" colorScheme="teal"
              onClick={() => { setSmsText(''); setSmsResults([]); onSmsOpen(); }}>
              💬 Paste SMS
            </Button>
            <GradientButton onClick={openAdd} size="sm">+ Add Card</GradientButton>
          </HStack>
        </HStack>

        {/* ── Summary ── */}
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
          {[
            { label: 'Total Credit Limit', value: formatINR(totalLimit), color: 'blue.500' },
            { label: 'Total Outstanding',  value: formatINR(totalOutstanding), color: 'red.500' },
            { label: 'Avg Utilization',    value: `${avgUtilization}%`, color: utilizationColor(avgUtilization) + '.500' },
            { label: 'Min Due This Month', value: formatINR(totalMinDue), color: 'orange.500' },
          ].map(s => (
            <GlassCard key={s.label} p={4}>
              <Stat>
                <StatLabel fontSize="xs" color="gray.500">{s.label}</StatLabel>
                <StatNumber fontSize="lg" color={s.color}>{s.value}</StatNumber>
              </Stat>
            </GlassCard>
          ))}
        </SimpleGrid>

        {/* ── Cards grid ── */}
        {isLoading ? (
          <Box textAlign="center" p={8}><Spinner color="purple.500" /></Box>
        ) : !cards?.length ? (
          <GlassCard>
            <Box textAlign="center" py={8}>
              <Text fontSize="2xl" mb={2}>💳</Text>
              <Text color="gray.500" mb={3}>No credit cards added yet.</Text>
              <GradientButton size="sm" onClick={openAdd}>Add your first card</GradientButton>
            </Box>
          </GlassCard>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {cards.map(card => {
              const uColor = utilizationColor(card.utilization_pct);
              const dueSoon = card.days_until_due !== null && card.days_until_due <= 5;
              const available = card.credit_limit - card.outstanding_balance;
              return (
                <Box key={card.id} borderRadius="xl" overflow="hidden" boxShadow="md">
                  {/* Card face */}
                  <Box bgGradient={cardGradient(card.bank_name)} p={4} color="white" position="relative">
                    <HStack justify="space-between" mb={3}>
                      <Text fontWeight="bold" fontSize="sm">{card.bank_name}</Text>
                      <Text fontSize="xs" opacity={0.8}>{card.card_name}</Text>
                    </HStack>
                    <Text fontFamily="mono" fontSize="md" letterSpacing="widest" mb={3}>
                      •••• •••• •••• {card.last4_digits}
                    </Text>
                    <HStack justify="space-between" align="flex-end">
                      <Box>
                        <Text fontSize="9px" opacity={0.7} textTransform="uppercase">Outstanding</Text>
                        <Text fontWeight="bold" fontSize="lg">{formatINR(card.outstanding_balance)}</Text>
                      </Box>
                      <Box textAlign="right">
                        <Text fontSize="9px" opacity={0.7} textTransform="uppercase">Limit</Text>
                        <Text fontSize="sm" fontWeight="semibold">{formatINR(card.credit_limit)}</Text>
                      </Box>
                    </HStack>
                  </Box>

                  {/* Card details */}
                  <Box bg="white" _dark={{ bg: 'gray.800' }} p={3}>
                    {/* Utilization bar */}
                    <HStack justify="space-between" mb={1}>
                      <Text fontSize="10px" color="gray.500">Utilization</Text>
                      <Text fontSize="10px" fontWeight="semibold" color={`${uColor}.500`}>
                        {card.utilization_pct}%
                      </Text>
                    </HStack>
                    <Progress value={Math.min(card.utilization_pct, 100)} colorScheme={uColor} size="xs" borderRadius="full" mb={2} />

                    {/* Key stats row */}
                    <SimpleGrid columns={3} spacing={2} mb={2}>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Available</Text>
                        <Text fontSize="xs" fontWeight="semibold" color="green.600">{formatINR(available)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Min Due</Text>
                        <Text fontSize="xs" fontWeight="semibold" color="orange.500">{formatINR(card.minimum_due)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Due Date</Text>
                        <Text fontSize="xs" fontWeight="semibold" color={dueSoon ? 'red.500' : 'gray.700'}>
                          {card.due_date ? `${card.due_date}th` : '—'}
                          {card.days_until_due !== null && (
                            <Text as="span" fontSize="9px" color={dueSoon ? 'red.500' : 'gray.400'}>
                              {' '}({card.days_until_due === 0 ? 'Today!' : `${card.days_until_due}d`})
                            </Text>
                          )}
                        </Text>
                      </Box>
                    </SimpleGrid>

                    {card.interest_rate && (
                      <Text fontSize="9px" color="gray.400" mb={2}>APR {card.interest_rate}% · {card.rewards_points} pts</Text>
                    )}

                    {/* Due soon alert */}
                    {dueSoon && card.outstanding_balance > 0 && (
                      <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md" px={2} py={1} mb={2}>
                        <Text fontSize="10px" color="red.600" fontWeight="semibold">
                          ⚠️ Due {card.days_until_due === 0 ? 'today' : `in ${card.days_until_due} days`} — pay at least {formatINR(card.minimum_due)}
                        </Text>
                      </Box>
                    )}

                    {/* Action buttons */}
                    <HStack spacing={1} justify="flex-end">
                      <Tooltip label="Upload statement PDF" hasArrow>
                        <IconButton aria-label="Upload statement" icon={<Text fontSize="xs">📄</Text>} size="xs" variant="ghost" colorScheme="teal"
                          onClick={() => { setStmtCard(card); setStmtParsed(null); setStmtFile(null); setStmtPassword(''); onStmtOpen(); }} />
                      </Tooltip>
                      <Tooltip label="Add spend / transaction" hasArrow>
                        <IconButton aria-label="Add spend" icon={<Text fontSize="xs">🛒</Text>} size="xs" variant="ghost" colorScheme="blue"
                          onClick={() => openTransactions(card)} />
                      </Tooltip>
                      <Tooltip label="Pay bill" hasArrow>
                        <IconButton aria-label="Pay bill" icon={<Text fontSize="xs">💸</Text>} size="xs" variant="ghost" colorScheme="green"
                          onClick={() => { setPayCard(card); setPayAmount(String(card.outstanding_balance / 100)); setPayDate(new Date().toISOString().split('T')[0]); onPayOpen(); }} />
                      </Tooltip>
                      <Tooltip label="Transaction history" hasArrow>
                        <IconButton aria-label="History" icon={<Text fontSize="xs">📋</Text>} size="xs" variant="ghost" colorScheme="purple"
                          onClick={() => openTransactions(card)} />
                      </Tooltip>
                      <Tooltip label="Edit card" hasArrow>
                        <IconButton aria-label="Edit" icon={<Text fontSize="xs">✏️</Text>} size="xs" variant="ghost" colorScheme="blue"
                          onClick={() => openEdit(card)} />
                      </Tooltip>
                      <Tooltip label="Delete card" hasArrow>
                        <IconButton aria-label="Delete" icon={<Text fontSize="xs">🗑️</Text>} size="xs" variant="ghost" colorScheme="red"
                          onClick={() => { setDeleteCard(card); onDeleteOpen(); }} />
                      </Tooltip>
                    </HStack>
                  </Box>
                </Box>
              );
            })}
          </SimpleGrid>
        )}
      </VStack>

      {/* ── Add/Edit Card Modal ── */}
      <Modal isOpen={isFormOpen} onClose={closeForm} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>{editingCard ? 'Edit Card' : 'Add Credit Card'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3}>
              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Bank Name</FormLabel>
                  <Input placeholder="e.g. HDFC Bank" {...register('bank_name', { required: true })} />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Card Name</FormLabel>
                  <Input placeholder="e.g. Regalia" {...register('card_name', { required: true })} />
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Last 4 Digits</FormLabel>
                  <Input placeholder="1234" maxLength={4} {...register('last4_digits', { required: true, minLength: 4, maxLength: 4 })} />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Credit Limit (₹)</FormLabel>
                  <NumberInput min={1}>
                    <NumberInputField placeholder="100000" {...register('credit_limit', { required: true })} />
                  </NumberInput>
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl>
                  <FormLabel fontSize="sm">Current Outstanding (₹)</FormLabel>
                  <NumberInput min={0}>
                    <NumberInputField placeholder="0" {...register('outstanding_balance')} />
                  </NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Minimum Due (₹)</FormLabel>
                  <NumberInput min={0}>
                    <NumberInputField placeholder="0" {...register('minimum_due')} />
                  </NumberInput>
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl>
                  <FormLabel fontSize="sm">Due Date (day of month)</FormLabel>
                  <NumberInput min={1} max={31}>
                    <NumberInputField placeholder="15" {...register('due_date')} />
                  </NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Interest Rate (% p.a.)</FormLabel>
                  <NumberInput min={0} step={0.1}>
                    <NumberInputField placeholder="36" {...register('interest_rate')} />
                  </NumberInput>
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <FormLabel fontSize="sm">Rewards Points</FormLabel>
                <NumberInput min={0}>
                  <NumberInputField placeholder="0" {...register('rewards_points')} />
                </NumberInput>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={closeForm}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {editingCard ? 'Save Changes' : 'Add Card'}
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Pay Bill Modal ── */}
      <Modal isOpen={isPayOpen} onClose={onPayClose} size="sm">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            Pay Credit Card Bill
            {payCard && <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={0.5}>{payCard.bank_name} ···· {payCard.last4_digits}</Text>}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {payCard && (
              <VStack spacing={4}>
                <SimpleGrid columns={2} spacing={3} w="full">
                  <Box bg="red.50" p={3} borderRadius="md" textAlign="center">
                    <Text fontSize="xs" color="gray.500">Total Outstanding</Text>
                    <Text fontWeight="bold" color="red.600">{formatINR(payCard.outstanding_balance)}</Text>
                  </Box>
                  <Box bg="orange.50" p={3} borderRadius="md" textAlign="center">
                    <Text fontSize="xs" color="gray.500">Minimum Due</Text>
                    <Text fontWeight="bold" color="orange.600">{formatINR(payCard.minimum_due)}</Text>
                  </Box>
                </SimpleGrid>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Amount Paying (₹)</FormLabel>
                  <NumberInput min={1} value={payAmount} onChange={v => setPayAmount(v)}>
                    <NumberInputField />
                  </NumberInput>
                  <HStack mt={1} spacing={2}>
                    <Button size="xs" variant="outline" onClick={() => setPayAmount(String(payCard.minimum_due / 100))}>Min Due</Button>
                    <Button size="xs" variant="outline" onClick={() => setPayAmount(String(payCard.outstanding_balance / 100))}>Full Pay</Button>
                  </HStack>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Payment Date</FormLabel>
                  <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </FormControl>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onPayClose}>Cancel</Button>
            <Button colorScheme="green" size="sm"
              isDisabled={!payAmount || !payDate || parseFloat(payAmount) <= 0}
              isLoading={payBillMutation.isPending}
              onClick={() => payCard && payBillMutation.mutate({ cardId: payCard.id, amount: Math.round(parseFloat(payAmount) * 100), date: payDate })}>
              Record Payment
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Transactions Modal ── */}
      <Modal isOpen={isTxnOpen} onClose={onTxnClose} size="xl">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            {selectedCard?.bank_name} ···· {selectedCard?.last4_digits}
            <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={0.5}>
              Outstanding: {selectedCard ? formatINR(selectedCard.outstanding_balance) : '—'}
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Add transaction form */}
              <Box as="form" onSubmit={txnForm.handleSubmit(onAddTxn)} p={3} bg="gray.50" borderRadius="md" _dark={{ bg: 'gray.700' }}>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>Add Transaction</Text>
                <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
                  <FormControl isRequired>
                    <FormLabel fontSize="xs">Amount (₹)</FormLabel>
                    <NumberInput min={1} size="sm">
                      <NumberInputField placeholder="0" {...txnForm.register('amount', { required: true })} />
                    </NumberInput>
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel fontSize="xs">Date</FormLabel>
                    <Input type="date" size="sm" {...txnForm.register('date', { required: true })} />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="xs">Description</FormLabel>
                    <Input placeholder="e.g. Swiggy" size="sm" {...txnForm.register('description')} />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="xs">Type</FormLabel>
                    <HStack>
                      <Switch colorScheme="green" {...txnForm.register('is_payment')} />
                      <Text fontSize="xs">{txnForm.watch('is_payment') ? 'Payment' : 'Purchase'}</Text>
                    </HStack>
                  </FormControl>
                </SimpleGrid>
                <Button mt={2} size="sm" colorScheme="blue" type="submit" isLoading={addTxnMutation.isPending}>
                  Add
                </Button>
              </Box>

              <Divider />

              {/* Month filter */}
              <HStack spacing={2}>
                <Text fontSize="sm" color="gray.500">Filter:</Text>
                <Select size="sm" w="28" value={txnMonth} onChange={e => setTxnMonth(parseInt(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</option>
                  ))}
                </Select>
                <Select size="sm" w="24" value={txnYear} onChange={e => setTxnYear(parseInt(e.target.value))}>
                  {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </Select>
              </HStack>

              {/* Transactions table */}
              {txnLoading ? (
                <Box textAlign="center" py={4}><Spinner size="sm" /></Box>
              ) : !transactions?.length ? (
                <Text color="gray.400" fontSize="sm" textAlign="center" py={4}>No transactions this month</Text>
              ) : (
                <>
                  {/* Month summary */}
                  {(() => {
                    const spent = transactions.filter(t => !t.is_payment).reduce((s, t) => s + t.amount, 0);
                    const paid  = transactions.filter(t => t.is_payment).reduce((s, t) => s + t.amount, 0);
                    return (
                      <HStack spacing={4} px={1}>
                        <Text fontSize="xs" color="red.500">Spent: {formatINR(spent)}</Text>
                        <Text fontSize="xs" color="green.500">Paid: {formatINR(paid)}</Text>
                        <Text fontSize="xs" color="gray.500">{transactions.length} transactions</Text>
                      </HStack>
                    );
                  })()}
                  <TableContainer>
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          <Th fontSize="10px">Date</Th>
                          <Th fontSize="10px">Description</Th>
                          <Th fontSize="10px">Type</Th>
                          <Th fontSize="10px" isNumeric>Amount</Th>
                          <Th></Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {transactions.map(txn => (
                          <Tr key={txn.id}>
                            <Td fontSize="xs" color="gray.500">{formatDate(txn.date)}</Td>
                            <Td fontSize="xs">{txn.description || '—'}</Td>
                            <Td>
                              <Badge colorScheme={txn.is_payment ? 'green' : 'red'} fontSize="9px">
                                {txn.is_payment ? 'Payment' : 'Purchase'}
                              </Badge>
                            </Td>
                            <Td isNumeric>
                              <Text fontSize="xs" fontWeight="semibold" color={txn.is_payment ? 'green.600' : 'red.500'}>
                                {txn.is_payment ? '+' : '-'}{formatINR(txn.amount)}
                              </Text>
                            </Td>
                            <Td>
                              <IconButton
                                aria-label="Delete"
                                icon={<Text fontSize="10px">🗑️</Text>}
                                size="xs" variant="ghost" colorScheme="red"
                                isLoading={deleteTxnMutation.isPending}
                                onClick={() => selectedCard && deleteTxnMutation.mutate({ cardId: selectedCard.id, txnId: txn.id })}
                              />
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" size="sm" onClick={onTxnClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Upload Statement Modal ── */}
      <Modal isOpen={isStmtOpen} onClose={onStmtClose} size={stmtParsed ? '3xl' : 'md'} scrollBehavior="inside">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            Upload Statement
            {stmtCard && <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={0.5}>{stmtCard.bank_name} ···· {stmtCard.last4_digits}</Text>}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {!stmtParsed ? (
              /* ── Step 1: Upload ── */
              <VStack spacing={4} align="stretch">
                <Box bg="blue.50" _dark={{ bg: 'blue.900' }} p={3} borderRadius="md">
                  <Text fontSize="sm" color="blue.700" _dark={{ color: 'blue.200' }}>
                    Upload your credit card PDF statement. We'll automatically extract the billing date, payment due date, outstanding amount, minimum due, and all transactions.
                  </Text>
                </Box>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Statement PDF</FormLabel>
                  <Input
                    type="file"
                    accept=".pdf"
                    p={1}
                    onChange={e => setStmtFile(e.target.files?.[0] ?? null)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">PDF Password (if protected)</FormLabel>
                  <Input
                    type="password"
                    placeholder="Usually your DOB e.g. 15081990"
                    value={stmtPassword}
                    onChange={e => setStmtPassword(e.target.value)}
                  />
                  <Text fontSize="10px" color="gray.400" mt={1}>Leave blank if your PDF is not password-protected</Text>
                </FormControl>
              </VStack>
            ) : (
              /* ── Step 2: Review parsed data ── */
              <VStack spacing={4} align="stretch">
                <Text fontSize="sm" fontWeight="semibold" color="green.600">✅ Statement parsed successfully</Text>

                {/* Header fields */}
                <Box border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
                  <Text fontSize="xs" fontWeight="semibold" color="gray.500" mb={2} textTransform="uppercase">Extracted Fields</Text>
                  <SimpleGrid columns={2} spacing={3}>
                    <Box>
                      <Text fontSize="10px" color="gray.400">Billing Date</Text>
                      <Text fontSize="sm" fontWeight="semibold">{stmtParsed.statement_date ?? '—'}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="10px" color="gray.400">Payment Due Date</Text>
                      <Text fontSize="sm" fontWeight="semibold" color={stmtParsed.due_date ? 'orange.600' : 'gray.400'}>
                        {stmtParsed.due_date ?? '—'}
                        {stmtParsed.due_day && <Text as="span" color="gray.400" fontSize="10px"> (day {stmtParsed.due_day})</Text>}
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="10px" color="gray.400">Total Amount Due</Text>
                      <Text fontSize="sm" fontWeight="bold" color="red.600">
                        {stmtParsed.total_due_paise ? formatINR(stmtParsed.total_due_paise) : '—'}
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="10px" color="gray.400">Minimum Amount Due</Text>
                      <Text fontSize="sm" fontWeight="semibold" color="orange.600">
                        {stmtParsed.min_due_paise ? formatINR(stmtParsed.min_due_paise) : '—'}
                      </Text>
                    </Box>
                    {stmtParsed.credit_limit_paise && (
                      <Box>
                        <Text fontSize="10px" color="gray.400">Credit Limit</Text>
                        <Text fontSize="sm" fontWeight="semibold">{formatINR(stmtParsed.credit_limit_paise)}</Text>
                      </Box>
                    )}
                  </SimpleGrid>
                </Box>

                {/* Transactions */}
                {stmtParsed.transactions.length > 0 && (
                  <Box>
                    <HStack justify="space-between" mb={2}>
                      <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase">
                        Transactions ({stmtParsed.transactions.filter(t => t.selected).length} / {stmtParsed.transactions.length} selected)
                      </Text>
                      <HStack spacing={2}>
                        <Button size="xs" variant="link" onClick={() => setStmtParsed(p => p ? { ...p, transactions: p.transactions.map(t => ({ ...t, selected: true })) } : p)}>
                          All
                        </Button>
                        <Button size="xs" variant="link" colorScheme="gray" onClick={() => setStmtParsed(p => p ? { ...p, transactions: p.transactions.map(t => ({ ...t, selected: false })) } : p)}>
                          None
                        </Button>
                      </HStack>
                    </HStack>
                    <Box maxH="280px" overflowY="auto" border="1px solid" borderColor="gray.200" borderRadius="md">
                      <Table size="xs" variant="simple">
                        <Thead position="sticky" top={0} bg="white" _dark={{ bg: 'gray.800' }} zIndex={1}>
                          <Tr>
                            <Th w="6" px={2}></Th>
                            <Th fontSize="9px" px={2}>Date</Th>
                            <Th fontSize="9px" px={2}>Description</Th>
                            <Th fontSize="9px" px={2}>Type</Th>
                            <Th fontSize="9px" isNumeric px={2}>Amount</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {stmtParsed.transactions.map((txn, idx) => (
                            <Tr key={idx} opacity={txn.selected ? 1 : 0.4} cursor="pointer" onClick={() => toggleTxnSelect(idx)} _hover={{ bg: 'gray.50' }}>
                              <Td px={2}>
                                <Checkbox isChecked={txn.selected} onChange={() => toggleTxnSelect(idx)} size="sm" />
                              </Td>
                              <Td fontSize="10px" color="gray.500" px={2}>{txn.date}</Td>
                              <Td fontSize="10px" px={2} maxW="160px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{txn.description}</Td>
                              <Td px={2}>
                                <Badge colorScheme={txn.is_credit ? 'green' : 'red'} fontSize="8px">
                                  {txn.is_credit ? 'Refund' : 'Spend'}
                                </Badge>
                              </Td>
                              <Td isNumeric fontSize="10px" fontWeight="semibold" color={txn.is_credit ? 'green.600' : 'red.500'} px={2}>
                                {txn.is_credit ? '+' : '-'}{formatINR(txn.amount_paise)}
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </Box>
                    <Wrap mt={1} spacing={1}>
                      <WrapItem><Text fontSize="9px" color="gray.400">Tick/untick rows to include/exclude. Payments (Cr) = bill payments. Spend = purchases.</Text></WrapItem>
                    </Wrap>
                  </Box>
                )}

                {stmtParsed.transactions.length === 0 && (
                  <Box bg="yellow.50" p={2} borderRadius="md">
                    <Text fontSize="xs" color="yellow.700">No transactions detected. Card fields (outstanding, due date) will still be updated.</Text>
                  </Box>
                )}

                <Button size="xs" variant="ghost" colorScheme="gray" onClick={() => setStmtParsed(null)}>
                  ← Re-upload a different file
                </Button>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onStmtClose}>Cancel</Button>
            {!stmtParsed ? (
              <GradientButton
                size="sm"
                isDisabled={!stmtFile}
                isLoading={stmtParsing}
                onClick={handleParseStatement}
              >
                Parse Statement
              </GradientButton>
            ) : (
              <GradientButton
                size="sm"
                isLoading={applyStatementMutation.isPending}
                onClick={handleApplyStatement}
              >
                Apply to Card
              </GradientButton>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── SMS Parser Modal ── */}
      <Modal isOpen={isSmsOpen} onClose={onSmsClose} size={smsResults.length ? 'xl' : 'md'} scrollBehavior="inside">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            💬 Paste Bank SMS
            <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={0.5}>
              Paste transaction SMS from HDFC, SBI, ICICI, Axis, Kotak, Yes Bank…
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {!smsResults.length ? (
              /* ── Step 1: Paste ── */
              <VStack spacing={4} align="stretch">
                <Box bg="teal.50" _dark={{ bg: 'teal.900' }} p={3} borderRadius="md">
                  <Text fontSize="xs" color="teal.700" _dark={{ color: 'teal.200' }} fontWeight="semibold" mb={1}>How to paste SMS on Android:</Text>
                  <Text fontSize="xs" color="teal.700" _dark={{ color: 'teal.200' }}>
                    Open Messages → find bank SMS → long-press to copy → paste here.
                    You can paste multiple SMS at once — separate each with a blank line.
                  </Text>
                </Box>
                <Box bg="gray.50" _dark={{ bg: 'gray.700' }} p={3} borderRadius="md">
                  <Text fontSize="10px" color="gray.400" mb={1} fontFamily="mono">Example SMS formats supported:</Text>
                  <Text fontSize="10px" color="gray.500" fontFamily="mono" lineHeight="tall">
                    HDFC Bank: Rs.450.00 debited from a/c **4242 on 22-Jun-26 for SWIGGY.<br/>
                    SBI: Rs.500 debited from A/C XX4242. Info: AMAZON. Avl Bal: INR 24,500<br/>
                    ICICI Bank Credit Card XX4242 used for INR 1,500 at ZOMATO on 22-Jun-2026.
                  </Text>
                </Box>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Paste SMS here</FormLabel>
                  <Textarea
                    rows={8}
                    placeholder={'HDFC Bank: Rs.450.00 debited from a/c **4242 on 22-Jun-26 for SWIGGY. Avl bal: Rs.54,550.00\n\nSBI: Rs.1,200.00 debited from A/C XX1234 on 21-Jun-26. Info: AMAZON. Avl Bal: INR 48,800.00'}
                    value={smsText}
                    onChange={e => setSmsText(e.target.value)}
                    fontFamily="mono"
                    fontSize="xs"
                  />
                  <Text fontSize="10px" color="gray.400" mt={1}>Paste one or many SMS — each separated by a blank line</Text>
                </FormControl>
              </VStack>
            ) : (
              /* ── Step 2: Review ── */
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <Text fontSize="sm" color="green.600" fontWeight="semibold">
                    ✅ {smsResults.length} transaction{smsResults.length > 1 ? 's' : ''} found
                  </Text>
                  <HStack spacing={2}>
                    <Button size="xs" variant="link" onClick={() => setSmsResults(p => p.map(r => ({ ...r, selected: true })))}>All</Button>
                    <Button size="xs" variant="link" colorScheme="gray" onClick={() => setSmsResults(p => p.map(r => ({ ...r, selected: false })))}>None</Button>
                  </HStack>
                </HStack>

                <VStack spacing={3} align="stretch">
                  {smsResults.map((r, idx) => (
                    <Box
                      key={idx}
                      border="1px solid"
                      borderColor={r.selected ? 'teal.300' : 'gray.200'}
                      borderRadius="lg"
                      p={3}
                      bg={r.selected ? 'teal.50' : 'gray.50'}
                      _dark={{ bg: r.selected ? 'teal.900' : 'gray.700', borderColor: r.selected ? 'teal.600' : 'gray.600' }}
                      cursor="pointer"
                      onClick={() => toggleSmsSelect(idx)}
                      opacity={r.selected ? 1 : 0.6}
                      transition="all 0.15s"
                    >
                      <HStack justify="space-between" mb={2}>
                        <HStack>
                          <Checkbox isChecked={r.selected} onChange={() => toggleSmsSelect(idx)} colorScheme="teal" />
                          <Badge colorScheme={r.is_payment ? 'green' : 'red'} fontSize="9px">
                            {r.is_payment ? '↑ Payment/Refund' : '↓ Purchase'}
                          </Badge>
                          <Badge colorScheme={r.confidence === 'high' ? 'green' : r.confidence === 'medium' ? 'yellow' : 'red'} fontSize="9px" variant="outline">
                            {r.confidence}
                          </Badge>
                        </HStack>
                        <Text fontSize="sm" fontWeight="bold" color={r.is_payment ? 'green.600' : 'red.500'}>
                          {r.is_payment ? '+' : '-'}{r.amount_paise ? formatINR(r.amount_paise) : '?'}
                        </Text>
                      </HStack>

                      <SimpleGrid columns={2} spacing={2} mb={2}>
                        <Box>
                          <Text fontSize="9px" color="gray.400">Merchant</Text>
                          <Text fontSize="xs" fontWeight="semibold">{r.merchant ?? '—'}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="9px" color="gray.400">Date</Text>
                          <Text fontSize="xs">{r.date ?? 'Today'}</Text>
                        </Box>
                        {r.bank_name && (
                          <Box>
                            <Text fontSize="9px" color="gray.400">Bank</Text>
                            <Text fontSize="xs">{r.bank_name}</Text>
                          </Box>
                        )}
                        {r.available_paise && (
                          <Box>
                            <Text fontSize="9px" color="gray.400">Avl Balance</Text>
                            <Text fontSize="xs" color="blue.600">{formatINR(r.available_paise)}</Text>
                          </Box>
                        )}
                      </SimpleGrid>

                      {/* Card selector */}
                      <HStack onClick={e => e.stopPropagation()}>
                        <Text fontSize="10px" color="gray.500" minW="10">Card:</Text>
                        <Select
                          size="xs"
                          value={r.card_id ?? ''}
                          onChange={e => setSmsResults(prev => prev.map((x, i) =>
                            i === idx ? { ...x, card_id: e.target.value ? parseInt(e.target.value) : undefined } : x
                          ))}
                          borderColor={!r.card_id ? 'orange.400' : undefined}
                        >
                          <option value="">— Select card —</option>
                          {smsCards.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.bank_name} ···· {c.last4} ({c.card_name})
                            </option>
                          ))}
                        </Select>
                        {!r.card_id && (
                          <Text fontSize="9px" color="orange.500" whiteSpace="nowrap">Select card!</Text>
                        )}
                      </HStack>

                      {/* Raw SMS preview */}
                      <Text fontSize="9px" color="gray.400" mt={2} noOfLines={2} fontFamily="mono">
                        {r.raw}
                      </Text>
                    </Box>
                  ))}
                </VStack>

                <Button size="xs" variant="ghost" colorScheme="gray" onClick={() => setSmsResults([])}>
                  ← Paste different SMS
                </Button>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onSmsClose}>Cancel</Button>
            {!smsResults.length ? (
              <GradientButton
                size="sm"
                isDisabled={!smsText.trim()}
                isLoading={smsParsing}
                onClick={handleParseSms}
              >
                Parse SMS
              </GradientButton>
            ) : (
              <GradientButton
                size="sm"
                isDisabled={!smsResults.some(r => r.selected && r.card_id)}
                isLoading={applySmsTransactionsMutation.isPending}
                onClick={handleApplySms}
              >
                Add {smsResults.filter(r => r.selected && r.card_id).length} Transaction(s)
              </GradientButton>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Delete confirmation ── */}
      <AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader>Delete Card</AlertDialogHeader>
            <AlertDialogBody>
              Delete <strong>{deleteCard?.bank_name} ···· {deleteCard?.last4_digits}</strong>?
              All transactions will be deleted too.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} variant="ghost" size="sm" onClick={onDeleteClose}>Cancel</Button>
              <Button colorScheme="red" size="sm" isLoading={deleteMutation.isPending}
                onClick={() => deleteCard && deleteMutation.mutate(deleteCard.id)}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </PageWrapper>
  );
}
