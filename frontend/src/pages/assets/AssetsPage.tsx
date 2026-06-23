import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber,
  Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, ModalCloseButton, FormControl, FormLabel, Input, Select,
  Textarea, useDisclosure, useToast, Spinner, Badge, IconButton,
  NumberInput, NumberInputField,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, formatDate } from '../../lib/utils';
import api from '../../services/api';
import { Asset } from '../../types';

interface AssetForm {
  asset_type: string;
  name: string;
  purchase_value: string;
  current_value: string;
  purchase_date: string;
  notes: string;
}

const ASSET_TYPE_COLORS: Record<string, string> = {
  real_estate: 'blue', vehicle: 'orange', electronics: 'purple',
  jewelry: 'yellow', furniture: 'green', other: 'gray',
};

const ASSET_TYPE_ICONS: Record<string, string> = {
  real_estate: '🏠', vehicle: '🚗', electronics: '💻',
  jewelry: '💎', furniture: '🪑', other: '📦',
};

export default function AssetsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<AssetForm>();

  const { data: assets, isLoading } = useQuery<Asset[]>({
    queryKey: ['assets'],
    queryFn: () => api.get('/assets').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/assets', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast({ title: 'Asset added', status: 'success', duration: 2000 });
      reset(); onClose();
    },
    onError: () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/assets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast({ title: 'Asset removed', status: 'info', duration: 2000 });
    },
  });

  const onSubmit = (data: AssetForm) => {
    createMutation.mutate({
      asset_type: data.asset_type,
      name: data.name,
      purchase_value: Math.round(parseFloat(data.purchase_value) * 100),
      current_value: Math.round(parseFloat(data.current_value) * 100),
      purchase_date: data.purchase_date || null,
      notes: data.notes || null,
    });
  };

  const totalPurchase = assets?.reduce((s, a) => s + a.purchase_value, 0) ?? 0;
  const totalCurrent = assets?.reduce((s, a) => s + a.current_value, 0) ?? 0;
  const totalAppreciation = totalCurrent - totalPurchase;

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Assets</Heading>
            <Text color="gray.500" fontSize="sm">Track your physical assets</Text>
          </Box>
          <GradientButton onClick={onOpen} size="sm">+ Add Asset</GradientButton>
        </HStack>

        <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Assets</StatLabel>
              <StatNumber fontSize="lg">{formatINR(totalCurrent)}</StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Purchase Value</StatLabel>
              <StatNumber fontSize="lg">{formatINR(totalPurchase)}</StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Appreciation</StatLabel>
              <StatNumber fontSize="lg" color={totalAppreciation >= 0 ? 'green.500' : 'red.500'}>
                {totalAppreciation >= 0 ? '+' : ''}{formatINR(totalAppreciation)}
              </StatNumber>
            </Stat>
          </GlassCard>
        </SimpleGrid>

        {isLoading ? (
          <Box textAlign="center" p={8}><Spinner color="purple.500" /></Box>
        ) : assets?.length === 0 ? (
          <GlassCard>
            <Box textAlign="center" py={6}>
              <Text color="gray.500" mb={3}>No assets added yet.</Text>
              <GradientButton size="sm" onClick={onOpen}>Add your first asset</GradientButton>
            </Box>
          </GlassCard>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {assets?.map(asset => (
              <GlassCard key={asset.id}>
                <HStack justify="space-between" mb={3}>
                  <HStack>
                    <Text fontSize="xl">{ASSET_TYPE_ICONS[asset.asset_type] ?? '📦'}</Text>
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="semibold" fontSize="sm">{asset.name}</Text>
                      <Badge
                        colorScheme={ASSET_TYPE_COLORS[asset.asset_type] ?? 'gray'}
                        fontSize="xs" variant="subtle"
                      >
                        {asset.asset_type.replace('_', ' ')}
                      </Badge>
                    </VStack>
                  </HStack>
                  <IconButton
                    aria-label="Delete" icon={<Text fontSize="xs">✕</Text>}
                    size="xs" variant="ghost" colorScheme="red"
                    onClick={() => deleteMutation.mutate(asset.id)}
                  />
                </HStack>

                <SimpleGrid columns={2} spacing={2}>
                  <Box>
                    <Text fontSize="xs" color="gray.500">Purchase Value</Text>
                    <Text fontSize="sm" fontWeight="medium">{formatINR(asset.purchase_value)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color="gray.500">Current Value</Text>
                    <Text fontSize="sm" fontWeight="bold">{formatINR(asset.current_value)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color="gray.500">Appreciation</Text>
                    <Text fontSize="sm" fontWeight="medium" color={asset.appreciation >= 0 ? 'green.500' : 'red.500'}>
                      {asset.appreciation >= 0 ? '+' : ''}{formatINR(asset.appreciation)}
                    </Text>
                  </Box>
                  {asset.purchase_date && (
                    <Box>
                      <Text fontSize="xs" color="gray.500">Purchased</Text>
                      <Text fontSize="sm">{formatDate(asset.purchase_date)}</Text>
                    </Box>
                  )}
                </SimpleGrid>

                {asset.notes && (
                  <Text fontSize="xs" color="gray.500" mt={2} isTruncated>{asset.notes}</Text>
                )}
              </GlassCard>
            ))}
          </SimpleGrid>
        )}
      </VStack>

      <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>Add Asset</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Type</FormLabel>
                <Select placeholder="Select type" {...register('asset_type', { required: true })}>
                  <option value="real_estate">Real Estate</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="electronics">Electronics</option>
                  <option value="jewelry">Jewelry / Gold</option>
                  <option value="furniture">Furniture</option>
                  <option value="other">Other</option>
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Name</FormLabel>
                <Input placeholder="e.g. Honda City, MacBook Pro" {...register('name', { required: true })} />
              </FormControl>
              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Purchase Value (₹)</FormLabel>
                  <NumberInput min={0}><NumberInputField placeholder="0" {...register('purchase_value', { required: true })} /></NumberInput>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Current Value (₹)</FormLabel>
                  <NumberInput min={0}><NumberInputField placeholder="0" {...register('current_value', { required: true })} /></NumberInput>
                </FormControl>
              </SimpleGrid>
              <FormControl>
                <FormLabel fontSize="sm">Purchase Date</FormLabel>
                <Input type="date" {...register('purchase_date')} />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Notes</FormLabel>
                <Textarea rows={2} placeholder="Any notes..." {...register('notes')} />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending}>
              Add Asset
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}
