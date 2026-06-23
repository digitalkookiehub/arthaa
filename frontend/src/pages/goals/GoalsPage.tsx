import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Progress,
  Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, ModalCloseButton, FormControl, FormLabel, Input, Select,
  useDisclosure, useToast, Spinner, Badge, IconButton,
  NumberInput, NumberInputField, CircularProgress, CircularProgressLabel,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, formatDate } from '../../lib/utils';
import api from '../../services/api';
import { Goal } from '../../types';

interface GoalForm {
  goal_type: string;
  name: string;
  target_amount: string;
  current_amount: string;
  target_date: string;
  monthly_contribution: string;
  priority: string;
}

const GOAL_ICONS: Record<string, string> = {
  emergency_fund: '🛡️', home: '🏠', vehicle: '🚗', education: '🎓',
  travel: '✈️', wedding: '💍', retirement: '🌅', gadget: '📱', other: '🎯',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'green', completed: 'blue', paused: 'gray',
};

export default function GoalsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<GoalForm>();

  const { data: goals, isLoading } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/goals', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      toast({ title: 'Goal created', status: 'success', duration: 2000 });
      reset(); onClose();
    },
    onError: () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/goals/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      toast({ title: 'Goal removed', status: 'info', duration: 2000 });
    },
  });

  const onSubmit = (data: GoalForm) => {
    createMutation.mutate({
      goal_type: data.goal_type,
      name: data.name,
      target_amount: Math.round(parseFloat(data.target_amount) * 100),
      current_amount: data.current_amount ? Math.round(parseFloat(data.current_amount) * 100) : 0,
      target_date: data.target_date || null,
      monthly_contribution: data.monthly_contribution
        ? Math.round(parseFloat(data.monthly_contribution) * 100)
        : null,
      priority: parseInt(data.priority) || 3,
    });
  };

  const activeGoals = goals?.filter(g => g.status === 'active') ?? [];
  const completedGoals = goals?.filter(g => g.status === 'completed') ?? [];
  const totalTarget = activeGoals.reduce((s, g) => s + g.target_amount, 0);
  const totalSaved = activeGoals.reduce((s, g) => s + g.current_amount, 0);

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'green';
    if (pct >= 60) return 'blue';
    if (pct >= 30) return 'orange';
    return 'red';
  };

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Goals</Heading>
            <Text color="gray.500" fontSize="sm">Plan and track your financial goals</Text>
          </Box>
          <GradientButton onClick={onOpen} size="sm">+ New Goal</GradientButton>
        </HStack>

        <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
          <GlassCard p={4}>
            <Text fontSize="xs" color="gray.500">Active Goals</Text>
            <Text fontSize="2xl" fontWeight="bold">{activeGoals.length}</Text>
          </GlassCard>
          <GlassCard p={4}>
            <Text fontSize="xs" color="gray.500">Total Saved</Text>
            <Text fontSize="lg" fontWeight="bold" color="green.500">{formatINR(totalSaved)}</Text>
          </GlassCard>
          <GlassCard p={4}>
            <Text fontSize="xs" color="gray.500">Still Needed</Text>
            <Text fontSize="lg" fontWeight="bold" color="orange.500">
              {formatINR(Math.max(0, totalTarget - totalSaved))}
            </Text>
          </GlassCard>
        </SimpleGrid>

        {isLoading ? (
          <Box textAlign="center" p={8}><Spinner color="purple.500" /></Box>
        ) : goals?.length === 0 ? (
          <GlassCard>
            <Box textAlign="center" py={8}>
              <Text fontSize="3xl" mb={2}>🎯</Text>
              <Text color="gray.500" mb={3}>No goals yet. Start saving with purpose!</Text>
              <GradientButton size="sm" onClick={onOpen}>Create your first goal</GradientButton>
            </Box>
          </GlassCard>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {goals?.map(goal => {
              const pct = Math.min(goal.progress_pct, 100);
              const color = getProgressColor(goal.progress_pct);
              return (
                <GlassCard key={goal.id}>
                  <HStack justify="space-between" mb={4}>
                    <HStack>
                      <Text fontSize="2xl">{GOAL_ICONS[goal.goal_type] ?? '🎯'}</Text>
                      <VStack align="start" spacing={0}>
                        <Text fontWeight="semibold" fontSize="sm">{goal.name}</Text>
                        <Badge colorScheme={STATUS_COLORS[goal.status]} fontSize="xs">
                          {goal.status}
                        </Badge>
                      </VStack>
                    </HStack>
                    <IconButton
                      aria-label="Delete" icon={<Text fontSize="xs">✕</Text>}
                      size="xs" variant="ghost" colorScheme="red"
                      onClick={() => deleteMutation.mutate(goal.id)}
                    />
                  </HStack>

                  <HStack justify="space-between" mb={3}>
                    <CircularProgress value={pct} color={`${color}.500`} size="70px" thickness="10px">
                      <CircularProgressLabel fontSize="xs" fontWeight="bold">
                        {Math.round(goal.progress_pct)}%
                      </CircularProgressLabel>
                    </CircularProgress>
                    <VStack align="end" spacing={1}>
                      <Box textAlign="right">
                        <Text fontSize="xs" color="gray.500">Saved</Text>
                        <Text fontWeight="bold" color="green.600">{formatINR(goal.current_amount)}</Text>
                      </Box>
                      <Box textAlign="right">
                        <Text fontSize="xs" color="gray.500">Target</Text>
                        <Text fontWeight="semibold">{formatINR(goal.target_amount)}</Text>
                      </Box>
                    </VStack>
                  </HStack>

                  {goal.target_date && (
                    <Text fontSize="xs" color="gray.500">
                      Target by: {formatDate(goal.target_date)}
                    </Text>
                  )}
                  {goal.monthly_contribution && (
                    <Text fontSize="xs" color="purple.600" mt={1}>
                      Monthly: {formatINR(goal.monthly_contribution)}
                    </Text>
                  )}
                </GlassCard>
              );
            })}
          </SimpleGrid>
        )}
      </VStack>

      <Modal isOpen={isOpen} onClose={() => { reset(); onClose(); }} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>New Goal</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Goal Type</FormLabel>
                <Select placeholder="Select type" {...register('goal_type', { required: true })}>
                  <option value="emergency_fund">Emergency Fund</option>
                  <option value="home">Buy a Home</option>
                  <option value="vehicle">Buy a Vehicle</option>
                  <option value="education">Education</option>
                  <option value="travel">Travel</option>
                  <option value="wedding">Wedding</option>
                  <option value="retirement">Retirement</option>
                  <option value="gadget">Gadget</option>
                  <option value="other">Other</option>
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Goal Name</FormLabel>
                <Input placeholder="e.g. Emergency Fund 6 months" {...register('name', { required: true })} />
              </FormControl>
              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Target (₹)</FormLabel>
                  <NumberInput min={1}><NumberInputField placeholder="0" {...register('target_amount', { required: true })} /></NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Already Saved (₹)</FormLabel>
                  <NumberInput min={0}><NumberInputField placeholder="0" {...register('current_amount')} /></NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Monthly SIP (₹)</FormLabel>
                  <NumberInput min={0}><NumberInputField placeholder="0" {...register('monthly_contribution')} /></NumberInput>
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Priority (1-5)</FormLabel>
                  <Select defaultValue="3" {...register('priority')}>
                    {[1,2,3,4,5].map(p => <option key={p} value={p}>{p} {p === 1 ? '(Highest)' : p === 5 ? '(Lowest)' : ''}</option>)}
                  </Select>
                </FormControl>
              </SimpleGrid>
              <FormControl>
                <FormLabel fontSize="sm">Target Date</FormLabel>
                <Input type="date" {...register('target_date')} />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || createMutation.isPending}>
              Create Goal
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}
