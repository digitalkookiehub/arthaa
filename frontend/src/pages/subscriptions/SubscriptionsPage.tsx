import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Badge, Button, IconButton,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, Input, NumberInput, NumberInputField, Select, Switch,
  useDisclosure, useToast, Spinner, Stat, StatLabel, StatNumber,
  AlertDialog, AlertDialogBody, AlertDialogFooter, AlertDialogHeader,
  AlertDialogContent, AlertDialogOverlay, Tooltip,
  PinInput, PinInputField,
} from '@chakra-ui/react';
import { PieChart, Pie, Cell, Tooltip as RechartsTip, ResponsiveContainer, Legend } from 'recharts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useState, useRef } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR } from '../../lib/utils';
import api from '../../services/api';

// ── types ─────────────────────────────────────────────────────────────────────

interface Subscription {
  id: number;
  name: string;
  amount: number;
  billing_cycle: string;
  next_billing_date: string;
  category: string | null;
  is_active: boolean;
  monthly_equivalent: number;
  days_until_billing: number;
  created_at: string;
}

interface Summary {
  total_monthly: number;
  total_yearly: number;
  active_count: number;
  by_category: Array<{ category: string; monthly: number }>;
  due_soon: Subscription[];
}

interface SubForm {
  name: string;
  amount: string;
  billing_cycle: string;
  next_billing_date: string;
  category: string;
  is_active: boolean;
}

// ── constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Streaming', 'Music', 'News', 'Productivity', 'Gaming',
  'Fitness', 'Shopping', 'Cloud Storage', 'Finance', 'Education', 'Other',
];

const BILLING_CYCLES = [
  { value: 'weekly',      label: 'Weekly' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly',      label: 'Yearly' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Streaming: '#e53e3e', Music: '#805ad5', News: '#3182ce', Productivity: '#319795',
  Gaming: '#d69e2e', Fitness: '#38a169', Shopping: '#dd6b20', 'Cloud Storage': '#00b5d8',
  Finance: '#2d3748', Education: '#b7791f', Other: '#718096',
};

// well-known service icons
const SERVICE_ICONS: Record<string, string> = {
  netflix: '🎬', 'amazon prime': '📦', hotstar: '⭐', 'disney+': '🏰',
  spotify: '🎵', 'apple music': '🍎', gaana: '🎶', jiosaavn: '🎧',
  youtube: '▶️', 'youtube premium': '▶️',
  'google one': '☁️', icloud: '☁️', 'microsoft 365': '💼', dropbox: '📂',
  'linkedin premium': '💼', notion: '📝', slack: '💬', zoom: '📹',
  swiggy: '🛵', zomato: '🍕', 'swiggy one': '🛵', 'zomato gold': '🥇',
  gym: '🏋️', 'cult.fit': '💪',
  'the hindu': '📰', mint: '📊',
  default: '🔄',
};

function serviceIcon(name: string): string {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(SERVICE_ICONS)) {
    if (key.includes(k)) return v;
  }
  return SERVICE_ICONS.default;
}

function cycleLabel(cycle: string): string {
  return BILLING_CYCLES.find(c => c.value === cycle)?.label ?? cycle;
}

function dueColor(days: number): string {
  if (days <= 3)  return 'red';
  if (days <= 7)  return 'orange';
  if (days <= 14) return 'yellow';
  return 'green';
}

const PIE_COLORS = ['#e53e3e','#805ad5','#3182ce','#319795','#d69e2e','#38a169','#dd6b20','#00b5d8','#718096'];

// ── page ──────────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const toast  = useToast();
  const qc     = useQueryClient();

  const { isOpen: isFormOpen,   onOpen: onFormOpen,   onClose: onFormClose   } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

  const cancelRef = useRef<HTMLButtonElement>(null);

  const [editing,    setEditing]    = useState<Subscription | null>(null);
  const [toDelete,   setToDelete]   = useState<Subscription | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<SubForm>({
    defaultValues: { billing_cycle: 'monthly', is_active: true },
  });

  // ── queries ──

  const { data: subs, isLoading } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', activeOnly],
    queryFn: () => api.get('/subscriptions', { params: { active_only: activeOnly } }).then(r => r.data),
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ['subscriptions-summary'],
    queryFn: () => api.get('/subscriptions/summary').then(r => r.data),
  });

  // ── mutations ──

  const createMutation = useMutation({
    mutationFn: (d: object) => api.post('/subscriptions', d),
    onSuccess: () => { invalidate(); toast({ title: 'Subscription added', status: 'success', duration: 2000 }); closeForm(); },
    onError:   () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: number; d: object }) => api.put(`/subscriptions/${id}`, d),
    onSuccess: () => { invalidate(); toast({ title: 'Updated', status: 'success', duration: 2000 }); closeForm(); },
    onError:   () => toast({ title: 'Failed to update', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/subscriptions/${id}`),
    onSuccess: () => { invalidate(); toast({ title: 'Deleted', status: 'info', duration: 2000 }); onDeleteClose(); },
    onError:   () => toast({ title: 'Failed to delete', status: 'error', duration: 3000 }),
  });

  const renewMutation = useMutation({
    mutationFn: (id: number) => api.post(`/subscriptions/${id}/renew`),
    onSuccess: () => { invalidate(); toast({ title: 'Renewed — next date advanced', status: 'success', duration: 2500 }); },
    onError:   () => toast({ title: 'Failed', status: 'error', duration: 3000 }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/subscriptions/${id}`, { is_active }),
    onSuccess: () => invalidate(),
    onError: () => toast({ title: 'Failed to update', status: 'error', duration: 3000 }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
    qc.invalidateQueries({ queryKey: ['subscriptions-summary'] });
  };

  // ── handlers ──

  const openAdd = () => {
    setEditing(null);
    reset({ name: '', amount: '', billing_cycle: 'monthly', next_billing_date: '', category: '', is_active: true });
    onFormOpen();
  };

  const openEdit = (s: Subscription) => {
    setEditing(s);
    reset({
      name: s.name,
      amount: String(s.amount / 100),
      billing_cycle: s.billing_cycle,
      next_billing_date: s.next_billing_date,
      category: s.category ?? '',
      is_active: s.is_active,
    });
    onFormOpen();
  };

  const closeForm = () => { onFormClose(); setEditing(null); };

  const onSubmit = (data: SubForm) => {
    const payload = {
      name: data.name,
      amount: Math.round(parseFloat(data.amount) * 100),
      billing_cycle: data.billing_cycle,
      next_billing_date: data.next_billing_date,
      category: data.category || null,
      is_active: data.is_active,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, d: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // ── popular presets ──
  const PRESETS = [
    { name: 'Netflix',        amount: '649',  cycle: 'monthly',  cat: 'Streaming' },
    { name: 'Amazon Prime',   amount: '1499', cycle: 'yearly',   cat: 'Streaming' },
    { name: 'Hotstar',        amount: '299',  cycle: 'monthly',  cat: 'Streaming' },
    { name: 'Spotify',        amount: '119',  cycle: 'monthly',  cat: 'Music' },
    { name: 'YouTube Premium',amount: '189',  cycle: 'monthly',  cat: 'Streaming' },
    { name: 'Google One',     amount: '130',  cycle: 'monthly',  cat: 'Cloud Storage' },
    { name: 'Swiggy One',     amount: '399',  cycle: 'monthly',  cat: 'Shopping' },
    { name: 'Zomato Gold',    amount: '299',  cycle: 'monthly',  cat: 'Shopping' },
  ];

  const applyPreset = (p: typeof PRESETS[0]) => {
    setValue('name', p.name);
    setValue('amount', p.amount);
    setValue('billing_cycle', p.cycle);
    setValue('category', p.cat);
  };

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>

        {/* ── Header ── */}
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Subscriptions</Heading>
            <Text color="gray.500" fontSize="sm">Track recurring services and renewal dates</Text>
          </Box>
          <HStack>
            <HStack spacing={2}>
              <Text fontSize="sm" color="gray.500">Active only</Text>
              <Switch isChecked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} colorScheme="purple" />
            </HStack>
            <GradientButton size="sm" onClick={openAdd}>+ Add Subscription</GradientButton>
          </HStack>
        </HStack>

        {/* ── Summary stats ── */}
        {summary && (
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            {[
              { label: 'Monthly Spend',  value: formatINR(summary.total_monthly),  color: 'purple.500' },
              { label: 'Yearly Spend',   value: formatINR(summary.total_yearly),   color: 'red.500' },
              { label: 'Active Plans',   value: String(summary.active_count),      color: 'green.500' },
              { label: 'Due This Week',  value: String(summary.due_soon.length),   color: summary.due_soon.length > 0 ? 'orange.500' : 'gray.400' },
            ].map(s => (
              <GlassCard key={s.label} p={4}>
                <Stat>
                  <StatLabel fontSize="xs" color="gray.500">{s.label}</StatLabel>
                  <StatNumber fontSize="xl" color={s.color}>{s.value}</StatNumber>
                </Stat>
              </GlassCard>
            ))}
          </SimpleGrid>
        )}

        {/* ── Due soon alert ── */}
        {summary && summary.due_soon.length > 0 && (
          <Box bg="orange.50" border="1px solid" borderColor="orange.200" borderRadius="xl" p={4} _dark={{ bg: 'orange.900', borderColor: 'orange.700' }}>
            <Text fontSize="sm" fontWeight="semibold" color="orange.700" _dark={{ color: 'orange.200' }} mb={2}>
              ⏰ Due within 7 days
            </Text>
            <HStack flexWrap="wrap" spacing={2}>
              {summary.due_soon.map(s => (
                <Badge key={s.id} colorScheme={dueColor(s.days_until_billing)} px={2} py={1} borderRadius="md" fontSize="xs">
                  {serviceIcon(s.name)} {s.name} — {s.days_until_billing === 0 ? 'Today!' : `${s.days_until_billing}d`} ({formatINR(s.amount)})
                </Badge>
              ))}
            </HStack>
          </Box>
        )}

        {/* ── Main layout: list + chart ── */}
        <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={5} alignItems="start">

          {/* ── Subscription cards ── */}
          <Box gridColumn={{ lg: 'span 2' }}>
            {isLoading ? (
              <Box textAlign="center" p={8}><Spinner color="purple.500" /></Box>
            ) : !subs?.length ? (
              <GlassCard>
                <Box textAlign="center" py={8}>
                  <Text fontSize="3xl" mb={2}>🔄</Text>
                  <Text color="gray.500" mb={3}>No subscriptions yet.</Text>
                  <GradientButton size="sm" onClick={openAdd}>Add your first subscription</GradientButton>
                </Box>
              </GlassCard>
            ) : (
              <VStack spacing={3} align="stretch">
                {subs.map(s => {
                  const color   = CATEGORY_COLORS[s.category ?? 'Other'] ?? '#718096';
                  const dColor  = dueColor(s.days_until_billing);
                  return (
                    <GlassCard key={s.id} p={0} overflow="hidden" opacity={s.is_active ? 1 : 0.55}>
                      <HStack spacing={0}>
                        {/* Color stripe */}
                        <Box w="4px" bg={color} alignSelf="stretch" flexShrink={0} borderRadius="xl 0 0 xl" />

                        <HStack flex={1} p={3} justify="space-between" flexWrap="wrap" gap={2}>
                          {/* Left: icon + name */}
                          <HStack spacing={3} minW="0">
                            <Text fontSize="2xl" flexShrink={0}>{serviceIcon(s.name)}</Text>
                            <Box minW="0">
                              <Text fontWeight="semibold" fontSize="sm" noOfLines={1}>{s.name}</Text>
                              <HStack spacing={1} mt={0.5}>
                                {s.category && (
                                  <Badge fontSize="9px" colorScheme="purple" variant="subtle">{s.category}</Badge>
                                )}
                                <Badge fontSize="9px" colorScheme="gray" variant="outline">{cycleLabel(s.billing_cycle)}</Badge>
                              </HStack>
                            </Box>
                          </HStack>

                          {/* Center: amount + monthly */}
                          <Box textAlign="center" minW="80px">
                            <Text fontWeight="bold" fontSize="md" color="purple.600">{formatINR(s.amount)}</Text>
                            <Text fontSize="9px" color="gray.400">/{s.billing_cycle === 'monthly' ? 'mo' : cycleLabel(s.billing_cycle).toLowerCase()}</Text>
                            {s.billing_cycle !== 'monthly' && (
                              <Text fontSize="9px" color="gray.500">≈ {formatINR(s.monthly_equivalent)}/mo</Text>
                            )}
                          </Box>

                          {/* Right: due date + actions */}
                          <VStack spacing={1} align="flex-end">
                            <Badge colorScheme={dColor} fontSize="9px" px={2}>
                              {s.days_until_billing === 0 ? '🔔 Due today' : `${s.days_until_billing}d left`}
                            </Badge>
                            <Text fontSize="9px" color="gray.400">{s.next_billing_date}</Text>
                          </VStack>

                          {/* Actions */}
                          <HStack spacing={0.5}>
                            <Tooltip label={s.is_active ? 'Pause' : 'Resume'} hasArrow>
                              <IconButton
                                aria-label="toggle"
                                icon={<Text fontSize="xs">{s.is_active ? '⏸' : '▶️'}</Text>}
                                size="xs" variant="ghost" colorScheme="gray"
                                isLoading={toggleMutation.isPending}
                                onClick={() => toggleMutation.mutate({ id: s.id, is_active: !s.is_active })}
                              />
                            </Tooltip>
                            <Tooltip label="Mark as renewed" hasArrow>
                              <IconButton
                                aria-label="renew"
                                icon={<Text fontSize="xs">✅</Text>}
                                size="xs" variant="ghost" colorScheme="green"
                                isLoading={renewMutation.isPending}
                                onClick={() => renewMutation.mutate(s.id)}
                              />
                            </Tooltip>
                            <Tooltip label="Edit" hasArrow>
                              <IconButton
                                aria-label="edit"
                                icon={<Text fontSize="xs">✏️</Text>}
                                size="xs" variant="ghost" colorScheme="blue"
                                onClick={() => openEdit(s)}
                              />
                            </Tooltip>
                            <Tooltip label="Delete" hasArrow>
                              <IconButton
                                aria-label="delete"
                                icon={<Text fontSize="xs">🗑️</Text>}
                                size="xs" variant="ghost" colorScheme="red"
                                onClick={() => { setToDelete(s); onDeleteOpen(); }}
                              />
                            </Tooltip>
                          </HStack>
                        </HStack>
                      </HStack>
                    </GlassCard>
                  );
                })}
              </VStack>
            )}
          </Box>

          {/* ── Right column: pie chart ── */}
          <VStack spacing={4} align="stretch">
            {summary && summary.by_category.length > 0 && (
              <GlassCard p={4}>
                <Text fontSize="sm" fontWeight="semibold" mb={3}>Monthly Spend by Category</Text>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={summary.by_category}
                      dataKey="monthly"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={35}
                    >
                      {summary.by_category.map((entry, idx) => (
                        <Cell key={idx} fill={CATEGORY_COLORS[entry.category] ?? PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTip formatter={(v: number) => formatINR(v)} />
                    <Legend formatter={v => v} iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
                <VStack spacing={1} align="stretch" mt={2}>
                  {summary.by_category.map(cat => (
                    <HStack key={cat.category} justify="space-between">
                      <HStack spacing={1.5}>
                        <Box w={2.5} h={2.5} borderRadius="sm" bg={CATEGORY_COLORS[cat.category] ?? 'gray.400'} flexShrink={0} />
                        <Text fontSize="11px" color="gray.600" _dark={{ color: 'gray.300' }}>{cat.category}</Text>
                      </HStack>
                      <Text fontSize="11px" fontWeight="semibold">{formatINR(cat.monthly)}/mo</Text>
                    </HStack>
                  ))}
                </VStack>
              </GlassCard>
            )}

            {/* Yearly projection card */}
            {summary && (
              <GlassCard p={4} bgGradient="linear(to-br, purple.50, pink.50)" _dark={{ bgGradient: 'linear(to-br, purple.900, pink.900)' }}>
                <Text fontSize="xs" color="gray.500" mb={1}>Annual subscription cost</Text>
                <Text fontSize="2xl" fontWeight="black" color="purple.600">{formatINR(summary.total_yearly)}</Text>
                <Text fontSize="xs" color="gray.400" mt={1}>Across {summary.active_count} active plans</Text>
              </GlassCard>
            )}
          </VStack>
        </SimpleGrid>
      </VStack>

      {/* ── Add/Edit Modal ── */}
      <Modal isOpen={isFormOpen} onClose={closeForm} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>{editing ? 'Edit Subscription' : 'Add Subscription'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3}>
              {/* Quick presets (only on add) */}
              {!editing && (
                <Box w="full">
                  <Text fontSize="xs" color="gray.500" mb={2}>Quick presets</Text>
                  <HStack flexWrap="wrap" spacing={1}>
                    {PRESETS.map(p => (
                      <Button
                        key={p.name}
                        size="xs"
                        variant="outline"
                        colorScheme="purple"
                        onClick={() => applyPreset(p)}
                      >
                        {serviceIcon(p.name)} {p.name}
                      </Button>
                    ))}
                  </HStack>
                </Box>
              )}

              <FormControl isRequired>
                <FormLabel fontSize="sm">Service Name</FormLabel>
                <Input placeholder="e.g. Netflix" {...register('name', { required: true })} />
              </FormControl>

              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Amount (₹)</FormLabel>
                  <NumberInput min={1}>
                    <NumberInputField placeholder="649" {...register('amount', { required: true })} />
                  </NumberInput>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Billing Cycle</FormLabel>
                  <Select {...register('billing_cycle')}>
                    {BILLING_CYCLES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Next Billing Date</FormLabel>
                  <Input type="date" {...register('next_billing_date', { required: true })} />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Category</FormLabel>
                  <Select {...register('category')}>
                    <option value="">— Select —</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <HStack justify="space-between">
                  <FormLabel fontSize="sm" mb={0}>Active</FormLabel>
                  <Switch
                    colorScheme="green"
                    isChecked={watch('is_active')}
                    onChange={e => setValue('is_active', e.target.checked)}
                  />
                </HStack>
              </FormControl>

              {/* Monthly equivalent preview */}
              {watch('amount') && watch('billing_cycle') && (
                <Box w="full" bg="purple.50" _dark={{ bg: 'purple.900' }} p={2} borderRadius="md">
                  <Text fontSize="xs" color="purple.600" _dark={{ color: 'purple.200' }}>
                    💡 Monthly cost:{' '}
                    <strong>
                      {formatINR(Math.round(
                        parseFloat(watch('amount') || '0') * 100 /
                        ({ weekly: 1/4.33, monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 }[watch('billing_cycle')] ?? 1)
                      ))}
                    </strong>
                    {' '}/ month
                  </Text>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={closeForm}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Save Changes' : 'Add Subscription'}
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Delete Confirm ── */}
      <AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader>Cancel Subscription</AlertDialogHeader>
            <AlertDialogBody>
              Remove <strong>{toDelete?.name}</strong>? This only removes it from tracking, not from the actual service.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} variant="ghost" size="sm" onClick={onDeleteClose}>Keep It</Button>
              <Button colorScheme="red" size="sm" isLoading={deleteMutation.isPending}
                onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}>
                Remove
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </PageWrapper>
  );
}
