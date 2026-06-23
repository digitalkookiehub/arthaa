import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Badge, Button, IconButton,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, Input, NumberInput, NumberInputField, Select, Textarea,
  useDisclosure, useToast, Spinner, Stat, StatLabel, StatNumber,
  AlertDialog, AlertDialogBody, AlertDialogFooter, AlertDialogHeader,
  AlertDialogContent, AlertDialogOverlay, Tooltip, Tabs, TabList, Tab, TabPanels, TabPanel,
  Divider,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useState, useRef } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR } from '../../lib/utils';
import api from '../../services/api';

// ── types ─────────────────────────────────────────────────────────────────────

interface Policy {
  id: number;
  insurance_type: 'life' | 'health' | 'vehicle' | 'other';
  provider: string;
  policy_number: string | null;
  premium_amount: number;
  premium_frequency: string;
  renewal_date: string;
  coverage_amount: number | null;
  nominee: string | null;
  yearly_premium: number;
  days_until_renewal: number;
  is_expired: boolean;
  created_at: string;
}

interface Summary {
  total_yearly_premium: number;
  total_coverage: number;
  active_count: number;
  expired_count: number;
  due_soon: Policy[];
  expired: Policy[];
  by_type: Record<string, { count: number; yearly_premium: number; coverage: number }>;
}

interface PolicyForm {
  insurance_type: string;
  provider: string;
  policy_number: string;
  premium_amount: string;
  premium_frequency: string;
  renewal_date: string;
  coverage_amount: string;
  nominee: string;
}

// ── constants ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: string; label: string; color: string; gradient: string }> = {
  life:    { icon: '❤️', label: 'Life',    color: 'red',    gradient: 'linear(to-br, red.400, pink.500)' },
  health:  { icon: '🏥', label: 'Health',  color: 'green',  gradient: 'linear(to-br, green.400, teal.500)' },
  vehicle: { icon: '🚗', label: 'Vehicle', color: 'blue',   gradient: 'linear(to-br, blue.400, cyan.500)' },
  other:   { icon: '🛡️', label: 'Other',   color: 'purple', gradient: 'linear(to-br, purple.400, indigo.500)' },
};

const FREQUENCIES = [
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly',      label: 'Yearly' },
];

// popular Indian providers by type
const PROVIDERS: Record<string, string[]> = {
  life:    ['LIC', 'HDFC Life', 'ICICI Prudential Life', 'SBI Life', 'Max Life', 'Bajaj Allianz Life', 'Tata AIA'],
  health:  ['Star Health', 'Niva Bupa', 'Care Health', 'HDFC Ergo Health', 'Aditya Birla Health', 'ManipalCigna', 'New India Assurance'],
  vehicle: ['HDFC Ergo', 'Bajaj Allianz', 'ICICI Lombard', 'New India Assurance', 'Tata AIG', 'Reliance General', 'United India'],
  other:   ['LIC', 'HDFC Ergo', 'ICICI Lombard', 'Bajaj Allianz', 'New India Assurance'],
};

function renewalColor(days: number, expired: boolean): string {
  if (expired)  return 'red';
  if (days <= 7)  return 'red';
  if (days <= 30) return 'orange';
  if (days <= 90) return 'yellow';
  return 'green';
}

function freqLabel(f: string): string {
  return FREQUENCIES.find(x => x.value === f)?.label ?? f;
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const toast = useToast();
  const qc    = useQueryClient();

  const { isOpen: isFormOpen,   onOpen: onFormOpen,   onClose: onFormClose   } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

  const cancelRef = useRef<HTMLButtonElement>(null);
  const [editing,  setEditing]  = useState<Policy | null>(null);
  const [toDelete, setToDelete] = useState<Policy | null>(null);
  const [tabIdx,   setTabIdx]   = useState(0);

  const TYPES = ['life', 'health', 'vehicle', 'other'] as const;

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<PolicyForm>({
    defaultValues: { insurance_type: 'health', premium_frequency: 'yearly' },
  });

  const selectedType = watch('insurance_type') as keyof typeof PROVIDERS;

  // ── queries ──

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ['insurance'],
    queryFn: () => api.get('/insurance').then(r => r.data),
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ['insurance-summary'],
    queryFn: () => api.get('/insurance/summary').then(r => r.data),
  });

  // ── mutations ──

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['insurance'] });
    qc.invalidateQueries({ queryKey: ['insurance-summary'] });
    qc.invalidateQueries({ queryKey: ['health-score'] });
  };

  const createMutation = useMutation({
    mutationFn: (d: object) => api.post('/insurance', d),
    onSuccess: () => { invalidate(); toast({ title: 'Policy added', status: 'success', duration: 2000 }); closeForm(); },
    onError:   () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: number; d: object }) => api.put(`/insurance/${id}`, d),
    onSuccess: () => { invalidate(); toast({ title: 'Updated', status: 'success', duration: 2000 }); closeForm(); },
    onError:   () => toast({ title: 'Failed to update', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/insurance/${id}`),
    onSuccess: () => { invalidate(); toast({ title: 'Policy deleted', status: 'info', duration: 2000 }); onDeleteClose(); },
    onError:   () => toast({ title: 'Failed to delete', status: 'error', duration: 3000 }),
  });

  // ── handlers ──

  const openAdd = (defaultType?: string) => {
    setEditing(null);
    reset({
      insurance_type: defaultType ?? 'health',
      provider: '',
      policy_number: '',
      premium_amount: '',
      premium_frequency: 'yearly',
      renewal_date: '',
      coverage_amount: '',
      nominee: '',
    });
    onFormOpen();
  };

  const openEdit = (p: Policy) => {
    setEditing(p);
    reset({
      insurance_type: p.insurance_type,
      provider: p.provider,
      policy_number: p.policy_number ?? '',
      premium_amount: String(p.premium_amount / 100),
      premium_frequency: p.premium_frequency,
      renewal_date: p.renewal_date,
      coverage_amount: p.coverage_amount ? String(p.coverage_amount / 100) : '',
      nominee: p.nominee ?? '',
    });
    onFormOpen();
  };

  const closeForm = () => { onFormClose(); setEditing(null); };

  const onSubmit = (data: PolicyForm) => {
    const payload = {
      insurance_type:    data.insurance_type,
      provider:          data.provider,
      policy_number:     data.policy_number || null,
      premium_amount:    Math.round(parseFloat(data.premium_amount) * 100),
      premium_frequency: data.premium_frequency,
      renewal_date:      data.renewal_date,
      coverage_amount:   data.coverage_amount ? Math.round(parseFloat(data.coverage_amount) * 100) : null,
      nominee:           data.nominee || null,
    };
    editing ? updateMutation.mutate({ id: editing.id, d: payload }) : createMutation.mutate(payload);
  };

  // ── filter by active tab type ──

  const activeTypes = TYPES[tabIdx] === 'other'
    ? policies?.filter(p => p.insurance_type === 'other') ?? []
    : policies?.filter(p => p.insurance_type === TYPES[tabIdx]) ?? [];

  // ── render ──

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>

        {/* ── Header ── */}
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Insurance</Heading>
            <Text color="gray.500" fontSize="sm">Track all your policies and renewal dates</Text>
          </Box>
          <GradientButton size="sm" onClick={() => openAdd()}>+ Add Policy</GradientButton>
        </HStack>

        {/* ── Summary stats ── */}
        {summary && (
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            {[
              { label: 'Annual Premium',  value: formatINR(summary.total_yearly_premium), color: 'purple.500' },
              { label: 'Total Coverage',  value: formatINR(summary.total_coverage),       color: 'green.500' },
              { label: 'Active Policies', value: String(summary.active_count),            color: 'blue.500' },
              { label: 'Expiring Soon',   value: String(summary.due_soon.length),         color: summary.due_soon.length > 0 ? 'orange.500' : 'gray.400' },
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

        {/* ── Type overview cards ── */}
        {summary && (
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            {TYPES.map(type => {
              const meta = TYPE_META[type];
              const info = summary.by_type[type];
              return (
                <Box
                  key={type}
                  bgGradient={meta.gradient}
                  borderRadius="xl"
                  p={4}
                  color="white"
                  cursor="pointer"
                  onClick={() => { setTabIdx(TYPES.indexOf(type)); }}
                  _hover={{ transform: 'translateY(-2px)', boxShadow: 'lg' }}
                  transition="all 0.2s"
                >
                  <Text fontSize="2xl" mb={1}>{meta.icon}</Text>
                  <Text fontWeight="bold" fontSize="sm">{meta.label}</Text>
                  {info ? (
                    <>
                      <Text fontSize="xs" opacity={0.85}>{info.count} {info.count === 1 ? 'policy' : 'policies'}</Text>
                      <Text fontSize="xs" opacity={0.75} mt={0.5}>{formatINR(info.yearly_premium)}/yr</Text>
                      {info.coverage > 0 && <Text fontSize="9px" opacity={0.65}>{formatINR(info.coverage)} cover</Text>}
                    </>
                  ) : (
                    <Text fontSize="xs" opacity={0.65}>No policies yet</Text>
                  )}
                </Box>
              );
            })}
          </SimpleGrid>
        )}

        {/* ── Expiry alerts ── */}
        {summary && (summary.due_soon.length > 0 || summary.expired.length > 0) && (
          <VStack spacing={2} align="stretch">
            {summary.expired.length > 0 && (
              <Box bg="red.50" border="1px solid" borderColor="red.200" borderRadius="xl" p={3} _dark={{ bg: 'red.900', borderColor: 'red.700' }}>
                <Text fontSize="sm" fontWeight="semibold" color="red.700" _dark={{ color: 'red.200' }} mb={1}>
                  🚨 {summary.expired.length} expired {summary.expired.length === 1 ? 'policy' : 'policies'} — renew immediately
                </Text>
                <HStack flexWrap="wrap" spacing={2}>
                  {summary.expired.map(p => (
                    <Badge key={p.id} colorScheme="red" fontSize="xs" px={2} py={0.5} borderRadius="md">
                      {TYPE_META[p.insurance_type].icon} {p.provider} · expired {p.renewal_date}
                    </Badge>
                  ))}
                </HStack>
              </Box>
            )}
            {summary.due_soon.length > 0 && (
              <Box bg="orange.50" border="1px solid" borderColor="orange.200" borderRadius="xl" p={3} _dark={{ bg: 'orange.900', borderColor: 'orange.700' }}>
                <Text fontSize="sm" fontWeight="semibold" color="orange.700" _dark={{ color: 'orange.200' }} mb={1}>
                  ⏰ Renewing within 30 days
                </Text>
                <HStack flexWrap="wrap" spacing={2}>
                  {summary.due_soon.map(p => (
                    <Badge key={p.id} colorScheme="orange" fontSize="xs" px={2} py={0.5} borderRadius="md">
                      {TYPE_META[p.insurance_type].icon} {p.provider} — {p.days_until_renewal}d · {formatINR(p.premium_amount)}
                    </Badge>
                  ))}
                </HStack>
              </Box>
            )}
          </VStack>
        )}

        {/* ── Policies by type (tabs) ── */}
        {isLoading ? (
          <Box textAlign="center" p={8}><Spinner color="purple.500" /></Box>
        ) : !policies?.length ? (
          <GlassCard>
            <Box textAlign="center" py={10}>
              <Text fontSize="3xl" mb={2}>🛡️</Text>
              <Text color="gray.500" mb={3}>No insurance policies added yet.</Text>
              <GradientButton size="sm" onClick={() => openAdd()}>Add your first policy</GradientButton>
            </Box>
          </GlassCard>
        ) : (
          <GlassCard p={0} overflow="hidden">
            <Tabs index={tabIdx} onChange={setTabIdx} colorScheme="purple" size="sm">
              <TabList px={4} pt={2}>
                {TYPES.map(type => {
                  const meta  = TYPE_META[type];
                  const count = policies.filter(p => p.insurance_type === type).length;
                  return (
                    <Tab key={type} fontSize="sm">
                      {meta.icon} {meta.label}
                      {count > 0 && (
                        <Badge ml={1.5} colorScheme={meta.color} borderRadius="full" fontSize="9px">{count}</Badge>
                      )}
                    </Tab>
                  );
                })}
              </TabList>

              <TabPanels>
                {TYPES.map(type => (
                  <TabPanel key={type} p={4}>
                    {activeTypes.length === 0 ? (
                      <Box textAlign="center" py={6}>
                        <Text fontSize="2xl" mb={2}>{TYPE_META[type].icon}</Text>
                        <Text color="gray.400" fontSize="sm" mb={3}>No {TYPE_META[type].label.toLowerCase()} policies</Text>
                        <Button size="sm" colorScheme={TYPE_META[type].color} onClick={() => openAdd(type)}>
                          + Add {TYPE_META[type].label} Policy
                        </Button>
                      </Box>
                    ) : (
                      <VStack spacing={3} align="stretch">
                        {activeTypes.map(p => {
                          const rColor = renewalColor(p.days_until_renewal, p.is_expired);
                          const meta   = TYPE_META[p.insurance_type];
                          return (
                            <Box
                              key={p.id}
                              border="1px solid"
                              borderColor={p.is_expired ? 'red.200' : 'gray.200'}
                              borderRadius="xl"
                              overflow="hidden"
                              _dark={{ borderColor: p.is_expired ? 'red.700' : 'gray.700' }}
                            >
                              <HStack spacing={0}>
                                {/* Gradient left stripe */}
                                <Box w="5px" bgGradient={meta.gradient} alignSelf="stretch" flexShrink={0} />

                                <Box flex={1} p={4}>
                                  <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
                                    {/* Provider + policy number */}
                                    <Box>
                                      <HStack spacing={2}>
                                        <Text fontWeight="bold" fontSize="md">{p.provider}</Text>
                                        {p.is_expired && <Badge colorScheme="red" fontSize="9px">EXPIRED</Badge>}
                                      </HStack>
                                      {p.policy_number && (
                                        <Text fontSize="xs" color="gray.400" fontFamily="mono">#{p.policy_number}</Text>
                                      )}
                                    </Box>

                                    {/* Actions */}
                                    <HStack spacing={1}>
                                      <Tooltip label="Edit" hasArrow>
                                        <IconButton aria-label="edit" icon={<Text fontSize="xs">✏️</Text>} size="xs" variant="ghost" colorScheme="blue" onClick={() => openEdit(p)} />
                                      </Tooltip>
                                      <Tooltip label="Delete" hasArrow>
                                        <IconButton aria-label="delete" icon={<Text fontSize="xs">🗑️</Text>} size="xs" variant="ghost" colorScheme="red"
                                          onClick={() => { setToDelete(p); onDeleteOpen(); }} />
                                      </Tooltip>
                                    </HStack>
                                  </HStack>

                                  <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                                    <Box>
                                      <Text fontSize="9px" color="gray.400" textTransform="uppercase">Premium</Text>
                                      <Text fontWeight="bold" color="purple.600">{formatINR(p.premium_amount)}</Text>
                                      <Text fontSize="9px" color="gray.400">/ {freqLabel(p.premium_frequency)}</Text>
                                    </Box>
                                    <Box>
                                      <Text fontSize="9px" color="gray.400" textTransform="uppercase">Annual Cost</Text>
                                      <Text fontWeight="semibold">{formatINR(p.yearly_premium)}</Text>
                                      <Text fontSize="9px" color="gray.400">per year</Text>
                                    </Box>
                                    {p.coverage_amount && (
                                      <Box>
                                        <Text fontSize="9px" color="gray.400" textTransform="uppercase">Coverage</Text>
                                        <Text fontWeight="semibold" color="green.600">{formatINR(p.coverage_amount)}</Text>
                                        <Text fontSize="9px" color="gray.400">sum assured</Text>
                                      </Box>
                                    )}
                                    <Box>
                                      <Text fontSize="9px" color="gray.400" textTransform="uppercase">Renewal</Text>
                                      <Badge colorScheme={rColor} fontSize="xs">
                                        {p.is_expired ? 'Expired' : p.days_until_renewal === 0 ? 'Today!' : `${p.days_until_renewal} days`}
                                      </Badge>
                                      <Text fontSize="9px" color="gray.400" mt={0.5}>{p.renewal_date}</Text>
                                    </Box>
                                  </SimpleGrid>

                                  {(p.nominee || p.insurance_type === 'life') && p.nominee && (
                                    <>
                                      <Divider my={2} />
                                      <Text fontSize="xs" color="gray.500">
                                        👤 Nominee: <strong>{p.nominee}</strong>
                                      </Text>
                                    </>
                                  )}
                                </Box>
                              </HStack>
                            </Box>
                          );
                        })}
                      </VStack>
                    )}
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </GlassCard>
        )}
      </VStack>

      {/* ── Add / Edit Modal ── */}
      <Modal isOpen={isFormOpen} onClose={closeForm} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>{editing ? 'Edit Policy' : 'Add Insurance Policy'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3}>
              {/* Type selector */}
              <FormControl isRequired>
                <FormLabel fontSize="sm">Insurance Type</FormLabel>
                <SimpleGrid columns={4} spacing={2}>
                  {TYPES.map(type => {
                    const meta    = TYPE_META[type];
                    const current = watch('insurance_type');
                    return (
                      <Box
                        key={type}
                        border="2px solid"
                        borderColor={current === type ? `${meta.color}.400` : 'gray.200'}
                        borderRadius="lg"
                        p={2}
                        textAlign="center"
                        cursor="pointer"
                        bg={current === type ? `${meta.color}.50` : 'transparent'}
                        _dark={{ borderColor: current === type ? `${meta.color}.500` : 'gray.600', bg: current === type ? `${meta.color}.900` : 'transparent' }}
                        onClick={() => setValue('insurance_type', type)}
                        transition="all 0.15s"
                      >
                        <Text fontSize="lg">{meta.icon}</Text>
                        <Text fontSize="9px" fontWeight="semibold" mt={0.5}>{meta.label}</Text>
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </FormControl>

              {/* Provider */}
              <FormControl isRequired>
                <FormLabel fontSize="sm">Provider / Company</FormLabel>
                <Select placeholder="Select or type below" {...register('provider', { required: true })}>
                  {(PROVIDERS[selectedType] ?? PROVIDERS.other).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
                <Input mt={1} placeholder="Or type provider name" size="sm" {...register('provider')} />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Policy Number</FormLabel>
                <Input placeholder="e.g. LIC-1234567890" fontFamily="mono" {...register('policy_number')} />
              </FormControl>

              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Premium Amount (₹)</FormLabel>
                  <NumberInput min={1}>
                    <NumberInputField placeholder="15000" {...register('premium_amount', { required: true })} />
                  </NumberInput>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Frequency</FormLabel>
                  <Select {...register('premium_frequency')}>
                    {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Renewal Date</FormLabel>
                  <Input type="date" {...register('renewal_date', { required: true })} />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Sum Assured / Coverage (₹)</FormLabel>
                  <NumberInput min={0}>
                    <NumberInputField placeholder="10000000" {...register('coverage_amount')} />
                  </NumberInput>
                </FormControl>
              </SimpleGrid>

              {/* Nominee — show only for life/health */}
              {(watch('insurance_type') === 'life' || watch('insurance_type') === 'health') && (
                <FormControl>
                  <FormLabel fontSize="sm">Nominee</FormLabel>
                  <Input placeholder="e.g. Spouse Name" {...register('nominee')} />
                </FormControl>
              )}

              {/* Annual cost preview */}
              {watch('premium_amount') && watch('premium_frequency') && (
                <Box w="full" bg="purple.50" _dark={{ bg: 'purple.900' }} p={2} borderRadius="md">
                  <Text fontSize="xs" color="purple.600" _dark={{ color: 'purple.200' }}>
                    💡 Annual cost:{' '}
                    <strong>
                      {formatINR(Math.round(
                        parseFloat(watch('premium_amount') || '0') * 100 *
                        ({ monthly: 12, quarterly: 4, half_yearly: 2, yearly: 1 }[watch('premium_frequency')] ?? 1)
                      ))}
                    </strong>
                    {' '}/ year
                  </Text>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={closeForm}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Save Changes' : 'Add Policy'}
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Delete confirm ── */}
      <AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader>Delete Policy</AlertDialogHeader>
            <AlertDialogBody>
              Delete <strong>{toDelete?.provider}</strong> ({toDelete ? TYPE_META[toDelete.insurance_type].label : ''}) policy?
              This cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} variant="ghost" size="sm" onClick={onDeleteClose}>Cancel</Button>
              <Button colorScheme="red" size="sm" isLoading={deleteMutation.isPending}
                onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </PageWrapper>
  );
}
