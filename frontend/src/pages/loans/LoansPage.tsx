import {
  Box, VStack, HStack, Heading, Text, SimpleGrid, Stat, StatLabel, StatNumber,
  Button, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody,
  ModalFooter, ModalCloseButton, FormControl, FormLabel, FormHelperText,
  Input, Select, useDisclosure, useToast, Spinner, Badge, Table, Thead,
  Tbody, Tr, Th, Td, TableContainer, NumberInput, NumberInputField, Progress,
  AlertDialog, AlertDialogBody, AlertDialogFooter, AlertDialogHeader,
  AlertDialogContent, AlertDialogOverlay, IconButton, Tooltip,
  Switch,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { formatINR, formatDate } from '../../lib/utils';
import api from '../../services/api';
import { Loan, RepaymentScheduleRow, RateHistory, GoldInterestPayment } from '../../types';
import { useRef, useState, useCallback } from 'react';

interface LoanForm {
  loan_type: string;
  bank_name: string;
  loan_account_number: string;
  repayment_type: 'emi' | 'bullet';
  loan_amount: string;
  outstanding_balance: string;
  starting_interest_rate: string;
  interest_rate: string;
  start_date: string;
  tenure_months: string;
  remaining_tenure: string;
  emi_amount: string;
  is_floating: boolean;
}

interface RateChangeForm {
  new_rate: string;
  effective_date: string;
  adjust_type: 'emi' | 'tenure';
  note: string;
}

const LOAN_TYPE_COLORS: Record<string, string> = {
  personal: 'purple', home: 'blue', vehicle: 'orange',
  education: 'green', business: 'teal', gold: 'yellow',
};

export default function LoansPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const { isOpen: isScheduleOpen, onOpen: onScheduleOpen, onClose: onScheduleClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const { isOpen: isUploadOpen, onOpen: onUploadOpen, onClose: onUploadClose } = useDisclosure();
  const { isOpen: isForecloseOpen, onOpen: onForecloseOpen, onClose: onForecloseClose } = useDisclosure();
  const { isOpen: isRateOpen, onOpen: onRateOpen, onClose: onRateClose } = useDisclosure();
  const { isOpen: isDetectOpen, onOpen: onDetectOpen, onClose: onDetectClose } = useDisclosure();
  const { isOpen: isPayInterestOpen, onOpen: onPayInterestOpen, onClose: onPayInterestClose } = useDisclosure();
  const { isOpen: isPrepayOpen, onOpen: onPrepayOpen, onClose: onPrepayClose } = useDisclosure();

  const { register, handleSubmit, reset, control, setValue, formState: { isSubmitting } } = useForm<LoanForm>();
  const watchedLoanAmount    = useWatch({ control, name: 'loan_amount' });
  const watchedOutstanding   = useWatch({ control, name: 'outstanding_balance' });
  const watchedEmi           = useWatch({ control, name: 'emi_amount' });
  const watchedIsFloating    = useWatch({ control, name: 'is_floating' });
  const watchedLoanType      = useWatch({ control, name: 'loan_type' });
  const watchedRepaymentType = useWatch({ control, name: 'repayment_type' });
  const isBullet = watchedRepaymentType === 'bullet';

  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [loanToDelete, setLoanToDelete] = useState<Loan | null>(null);
  const [uploadLoan, setUploadLoan] = useState<Loan | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [forecloseLoan, setForecloseLoan] = useState<Loan | null>(null);
  const [forecloseDate, setForecloseDate] = useState<string>('');
  const [rateChangeLoan, setRateChangeLoan] = useState<Loan | null>(null);
  const [rateAdjustType, setRateAdjustType] = useState<'emi' | 'tenure'>('tenure');
  const [detectLoan, setDetectLoan] = useState<Loan | null>(null);
  const [detectFiles, setDetectFiles] = useState<File[]>([]);
  const [detectPassword, setDetectPassword] = useState('');
  const [detectedChanges, setDetectedChanges] = useState<Array<{old_rate: number; new_rate: number; effective_date: string | null; raw_text: string; already_recorded: boolean}>>([]);
  const [detectStep, setDetectStep] = useState<'upload' | 'confirm'>('upload');
  const [statementTenure, setStatementTenure] = useState<{ remaining_tenure: number; outstanding_balance_paise?: number } | undefined>();
  const [payInterestLoan, setPayInterestLoan] = useState<Loan | null>(null);
  const [payInterestAmount, setPayInterestAmount] = useState('');
  const [payInterestDate, setPayInterestDate] = useState('');
  const [payInterestNote, setPayInterestNote] = useState('');
  const [prepayLoan, setPrepayLoan] = useState<Loan | null>(null);
  const [prepayAmount, setPrepayAmount] = useState('');
  const [prepayDate, setPrepayDate] = useState('');
  const [prepayMode, setPrepayMode] = useState<'tenure_reduce' | 'emi_increase'>('tenure_reduce');
  const [prepaySimulation, setPrepaySimulation] = useState<{ interest_saved: number; tenure_reduced: number; new_emi: number; new_tenure: number } | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const detectFileRef = useRef<HTMLInputElement>(null);

  const rateForm = useForm<RateChangeForm>({
    defaultValues: { adjust_type: 'tenure', note: '' },
  });
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = !!editingLoan;

  const { data: loans, isLoading } = useQuery<Loan[]>({
    queryKey: ['loans'],
    queryFn: () => api.get('/loans').then(r => r.data),
  });

  const { data: schedule, isLoading: schedLoading } = useQuery<RepaymentScheduleRow[]>({
    queryKey: ['loan-schedule', selectedLoan?.id],
    queryFn: () => api.get(`/loans/${selectedLoan!.id}/schedule`).then(r => r.data),
    enabled: !!selectedLoan,
  });

  const { data: goldPayments } = useQuery<GoldInterestPayment[]>({
    queryKey: ['gold-payments', payInterestLoan?.id],
    queryFn: () => api.get(`/loans/${payInterestLoan!.id}/gold-interest-payments`).then(r => r.data),
    enabled: !!payInterestLoan && isPayInterestOpen,
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/loans', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast({ title: 'Loan added', status: 'success', duration: 2000 });
      handleFormClose();
    },
    onError: () => toast({ title: 'Failed to save', status: 'error', duration: 3000 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/loans/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast({ title: 'Loan updated', status: 'success', duration: 2000 });
      handleFormClose();
    },
    onError: () => toast({ title: 'Failed to update', status: 'error', duration: 3000 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/loans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast({ title: 'Loan deleted', status: 'info', duration: 2000 });
      onDeleteClose();
    },
    onError: () => toast({ title: 'Failed to delete', status: 'error', duration: 3000 }),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/loans/${id}/upload-schedule`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loan-schedule', uploadLoan?.id] });
      toast({
        title: `Schedule imported — ${res.data.imported_rows} rows`,
        status: 'success',
        duration: 3000,
      });
      setUploadFile(null);
      setUploadLoan(null);
      onUploadClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Upload failed';
      toast({ title: msg, status: 'error', duration: 4000 });
    },
  });

  const closureMutation = useMutation({
    mutationFn: ({ id, amount, payDate }: { id: number; amount: number; payDate: string }) =>
      api.post(`/loans/${id}/prepayment`, {
        amount,
        date: payDate,
        prepayment_type: 'lump_sum',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loan-schedule', forecloseLoan?.id] });
      toast({ title: 'Loan closed! Prepayment recorded.', status: 'success', duration: 3000 });
      setForecloseLoan(null);
      onForecloseClose();
    },
    onError: () => toast({ title: 'Failed to record closure', status: 'error', duration: 3000 }),
  });

  const goldClosureMutation = useMutation({
    mutationFn: ({ id, closeDate }: { id: number; closeDate: string }) =>
      api.post(`/loans/${id}/gold-close`, { close_date: closeDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast({ title: 'Gold loan closed. Gold returned to you!', status: 'success', duration: 3500 });
      setForecloseLoan(null);
      onForecloseClose();
    },
    onError: () => toast({ title: 'Failed to close gold loan', status: 'error', duration: 3000 }),
  });

  const rateChangeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.post(`/loans/${id}/rate-change`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['rate-history', rateChangeLoan?.id] });
      toast({ title: 'Interest rate updated successfully', status: 'success', duration: 3000 });
      rateForm.reset({ adjust_type: 'tenure', note: '' });
      setRateChangeLoan(null);
      onRateClose();
    },
    onError: () => toast({ title: 'Failed to update rate', status: 'error', duration: 3000 }),
  });

  const detectMutation = useMutation({
    mutationFn: async ({ loan, files, password }: { loan: Loan; files: File[]; password: string }) => {
      type Change = typeof detectedChanges[number];
      const allChanges: Change[] = [];
      const allMissingFy: string[] = [];
      const allStatementTenure: { remaining_tenure: number; outstanding_balance_paise?: number }[] = [];

      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('password', password);
        const res = await api.post(`/loans/${loan.id}/detect-rate-changes`, fd);
        const { detected, missing_fy, remaining_tenure, outstanding_balance_paise } = res.data as {
          detected: Change[]; missing_fy: string[];
          remaining_tenure?: number; outstanding_balance_paise?: number;
        };
        allChanges.push(...detected);
        allMissingFy.push(...(missing_fy ?? []));
        if (remaining_tenure) allStatementTenure.push({ remaining_tenure, outstanding_balance_paise });
      }

      // Deduplicate across files by (old_rate, new_rate, effective_date)
      const seen = new Set<string>();
      const merged = allChanges
        .sort((a, b) => (a.effective_date ?? '9999') < (b.effective_date ?? '9999') ? -1 : 1)
        .filter(c => {
          const key = `${c.old_rate}|${c.new_rate}|${c.effective_date}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      // Use the latest statement's remaining tenure (last file = most recent)
      const latestTenure = allStatementTenure.length > 0 ? allStatementTenure[allStatementTenure.length - 1] : undefined;
      return { merged, missingFy: [...new Set(allMissingFy)], latestTenure };
    },
    onSuccess: ({ merged, missingFy, latestTenure }) => {
      if (merged.length === 0) {
        toast({ title: 'No rate changes found in the uploaded files', status: 'warning', duration: 4000 });
        return;
      }
      setDetectedChanges(merged);
      setStatementTenure(latestTenure);
      setDetectStep('confirm');
      if (missingFy.length > 0) {
        toast({
          title: `Missing statement(s): ${missingFy.join(', ')}`,
          description: 'Upload those years too for a complete rate history.',
          status: 'warning',
          duration: 8000,
          isClosable: true,
        });
      }
      const newCount = merged.filter(c => !c.already_recorded).length;
      toast({
        title: `Found ${merged.length} rate change(s) — ${newCount} new to apply`,
        status: 'success',
        duration: 4000,
      });
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d: { msg?: string }) => d?.msg ?? JSON.stringify(d)).join('; ')
        : typeof detail === 'string'
          ? detail
          : 'Could not read the file. Check the password and try again.';
      toast({ title: msg, status: 'error', duration: 5000 });
    },
  });

  const applyAllChangesMutation = useMutation({
    mutationFn: async ({ loan, changes, manualTenure }: { loan: Loan; changes: typeof detectedChanges; manualTenure?: number }) => {
      // skip_tenure_update=true: rate changes only record history + update interest rate.
      // Remaining tenure is set once at the end from the statement (authoritative source).
      for (const c of changes) {
        await api.post(`/loans/${loan.id}/rate-change`, {
          old_rate: c.old_rate,
          new_rate: c.new_rate,
          effective_date: c.effective_date ?? new Date().toISOString().split('T')[0],
          adjust_type: 'tenure',
          skip_tenure_update: true,
          note: `Auto-detected: ${c.raw_text}`,
        });
      }
      // Set the authoritative remaining tenure from the statement (or manual entry)
      const finalTenure = statementTenure?.remaining_tenure ?? manualTenure;
      if (finalTenure) {
        await api.put(`/loans/${loan.id}`, {
          remaining_tenure: finalTenure,
          ...(statementTenure?.outstanding_balance_paise
            ? { outstanding_balance: statementTenure.outstanding_balance_paise }
            : {}),
        });
      }
      return finalTenure;
    },
    onSuccess: (finalTenure) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['rate-history', detectLoan?.id] });
      const tenureMsg = finalTenure ? ` Remaining tenure set to ${finalTenure} months.` : ' Edit the loan to correct remaining tenure.';
      toast({
        title: `${detectedChanges.filter(c => !c.already_recorded).length} rate change(s) applied.${tenureMsg}`,
        status: 'success', duration: 5000,
      });
      setDetectLoan(null);
      setDetectedChanges([]);
      setDetectStep('upload');
      setDetectFiles([]);
      setDetectPassword('');
      setStatementTenure(undefined);
      onDetectClose();
    },
    onError: () => toast({ title: 'Failed to apply changes', status: 'error', duration: 3000 }),
  });

  const togglePaidMutation = useMutation({
    mutationFn: ({ loanId, rowId }: { loanId: number; rowId: number }) =>
      api.patch(`/loans/${loanId}/schedule/${rowId}/paid`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', selectedLoan?.id] });
    },
    onError: () => toast({ title: 'Failed to update status', status: 'error', duration: 3000 }),
  });

  const goldPaymentMutation = useMutation({
    mutationFn: ({ loanId, amount, payment_date, note }: { loanId: number; amount: number; payment_date: string; note?: string }) =>
      api.post(`/loans/${loanId}/gold-interest-payments`, { amount, payment_date, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['gold-payments', payInterestLoan?.id] });
      toast({ title: 'Interest payment recorded', status: 'success', duration: 2500 });
      onPayInterestClose();
      setPayInterestAmount('');
      setPayInterestNote('');
    },
    onError: () => toast({ title: 'Failed to record payment', status: 'error', duration: 3000 }),
  });

  const deleteGoldPaymentMutation = useMutation({
    mutationFn: ({ loanId, paymentId }: { loanId: number; paymentId: number }) =>
      api.delete(`/loans/${loanId}/gold-interest-payments/${paymentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['gold-payments', payInterestLoan?.id] });
      toast({ title: 'Payment deleted', status: 'info', duration: 2000 });
    },
    onError: () => toast({ title: 'Failed to delete', status: 'error', duration: 3000 }),
  });

  const prepayMutation = useMutation({
    mutationFn: ({ loanId, amount, date, prepayment_type }: { loanId: number; amount: number; date: string; prepayment_type: string }) =>
      api.post(`/loans/${loanId}/prepayment`, { amount, date, prepayment_type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast({ title: 'Partial payment recorded. Principal reduced!', status: 'success', duration: 3000 });
      onPrepayClose();
      setPrepayLoan(null);
      setPrepayAmount('');
      setPrepaySimulation(null);
    },
    onError: () => toast({ title: 'Failed to record payment', status: 'error', duration: 3000 }),
  });

  const runSimulation = async (loan: Loan, amountRupees: string, mode: string) => {
    const paise = Math.round(parseFloat(amountRupees) * 100);
    if (!paise || paise <= 0) { setPrepaySimulation(null); return; }
    setSimLoading(true);
    try {
      const res = await api.post(`/loans/${loan.id}/simulate-prepayment`, {
        amount: paise, date: prepayDate, prepayment_type: mode,
      });
      // Adjust for EMI mode on client side since backend simulate only does tenure mode
      if (mode === 'emi_increase') {
        const newOutstanding = loan.outstanding_balance - paise;
        // Use backend's new_tenure but calculate new_emi from loan data
        setPrepaySimulation({
          interest_saved: res.data.interest_saved,
          tenure_reduced: 0,
          new_emi: res.data.new_emi,
          new_tenure: loan.remaining_tenure,
        });
      } else {
        setPrepaySimulation(res.data);
      }
    } catch {
      setPrepaySimulation(null);
    } finally {
      setSimLoading(false);
    }
  };

  const openDetect = (loan: Loan) => {
    setDetectLoan(loan);
    setDetectedChanges([]);
    setDetectStep('upload');
    setDetectFiles([]);
    setDetectPassword('');
    onDetectOpen();
  };

  const previewINR = useCallback((raw: string | undefined) => {
    if (!raw) return null;
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return null;
    return formatINR(Math.round(n * 100));
  }, []);

  const handleFormClose = () => {
    reset();
    setEditingLoan(null);
    onFormClose();
  };

  const openAdd = () => {
    setEditingLoan(null);
    reset({});
    onFormOpen();
  };

  const openEdit = (loan: Loan) => {
    setEditingLoan(loan);
    reset({
      loan_type: loan.loan_type,
      bank_name: loan.bank_name,
      loan_account_number: loan.loan_account_number ?? '',
      repayment_type: (loan.repayment_type ?? 'emi') as 'emi' | 'bullet',
      loan_amount: String(loan.loan_amount / 100),
      outstanding_balance: String(loan.outstanding_balance / 100),
      starting_interest_rate: loan.starting_interest_rate != null ? String(loan.starting_interest_rate) : '',
      interest_rate: String(loan.interest_rate),
      start_date: loan.start_date,
      tenure_months: String(loan.tenure_months),
      remaining_tenure: String(loan.remaining_tenure),
      emi_amount: String(loan.emi_amount / 100),
      is_floating: loan.is_floating,
    });
    onFormOpen();
  };

  const openDelete = (loan: Loan) => {
    setLoanToDelete(loan);
    onDeleteOpen();
  };

  const openSchedule = (loan: Loan) => {
    setSelectedLoan(loan);
    onScheduleOpen();
  };

  const openUpload = (loan: Loan) => {
    setUploadLoan(loan);
    setUploadFile(null);
    onUploadOpen();
  };

  const openRateChange = (loan: Loan) => {
    setRateChangeLoan(loan);
    setRateAdjustType('tenure');
    rateForm.reset({
      new_rate: '',
      effective_date: new Date().toISOString().split('T')[0],
      adjust_type: 'tenure',
      note: '',
    });
    onRateOpen();
  };

  const openForeclose = (loan: Loan) => {
    setForecloseLoan(loan);
    // Default to today's date
    setForecloseDate(new Date().toISOString().split('T')[0]);
    onForecloseOpen();
  };

  const computeLastEmiDate = (loan: Loan): string => {
    const d = new Date(loan.start_date);
    d.setMonth(d.getMonth() + loan.tenure_months);
    return d.toISOString().split('T')[0];
  };

  const onSubmit = (data: LoanForm) => {
    if (isEditMode && editingLoan) {
      const isBulletEdit = data.repayment_type === 'bullet';
      updateMutation.mutate({
        id: editingLoan.id,
        data: {
          loan_type: data.loan_type,
          bank_name: data.bank_name,
          loan_account_number: data.loan_account_number || null,
          loan_amount: Math.round(parseFloat(data.loan_amount) * 100),
          outstanding_balance: Math.round(parseFloat(data.outstanding_balance) * 100),
          interest_rate: parseFloat(data.interest_rate),
          start_date: data.start_date,
          is_floating: data.is_floating,
          ...(!isBulletEdit ? {
            tenure_months: data.tenure_months ? parseInt(data.tenure_months) : undefined,
            remaining_tenure: data.remaining_tenure ? parseInt(data.remaining_tenure) : undefined,
          } : {}),
        },
      });
    } else {
      const isBulletSubmit = data.repayment_type === 'bullet';
      const remainingMonths = data.remaining_tenure ? parseInt(data.remaining_tenure) : undefined;
      createMutation.mutate({
        loan_type: data.loan_type,
        bank_name: data.bank_name,
        loan_account_number: data.loan_account_number || null,
        repayment_type: data.repayment_type || 'emi',
        loan_amount: Math.round(parseFloat(data.loan_amount) * 100),
        outstanding_balance: Math.round(parseFloat(data.outstanding_balance) * 100),
        ...(data.is_floating && data.starting_interest_rate ? { starting_interest_rate: parseFloat(data.starting_interest_rate) } : {}),
        interest_rate: parseFloat(data.interest_rate),
        start_date: data.start_date,
        is_floating: !!data.is_floating,
        // Bullet loans default to 12-month tenure from disbursement date
        ...(isBulletSubmit ? { tenure_months: 12 } : {
          tenure_months: data.tenure_months ? parseInt(data.tenure_months) : undefined,
          ...(remainingMonths ? { remaining_tenure: remainingMonths } : {}),
          ...(data.emi_amount ? { emi_amount: Math.round(parseFloat(data.emi_amount) * 100) } : {}),
        }),
      });
    }
  };

  const totalOutstanding = loans?.reduce((s, l) => s + l.outstanding_balance, 0) ?? 0;
  const totalEMI = loans?.reduce((s, l) => s + l.emi_amount, 0) ?? 0;
  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Loans</Heading>
            <Text color="gray.500" fontSize="sm">Manage your debts and EMIs</Text>
          </Box>
          <GradientButton onClick={openAdd} size="sm">+ Add Loan</GradientButton>
        </HStack>

        <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Total Outstanding</StatLabel>
              <StatNumber fontSize="lg" color="red.500">{formatINR(totalOutstanding)}</StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Monthly EMI Outflow</StatLabel>
              <StatNumber fontSize="lg" color="orange.500">{formatINR(totalEMI)}</StatNumber>
            </Stat>
          </GlassCard>
          <GlassCard p={4}>
            <Stat>
              <StatLabel fontSize="xs" color="gray.500">Active Loans</StatLabel>
              <StatNumber fontSize="lg">{loans?.length ?? '—'}</StatNumber>
            </Stat>
          </GlassCard>
        </SimpleGrid>

        {isLoading ? (
          <Box textAlign="center" p={8}><Spinner color="purple.500" /></Box>
        ) : loans?.length === 0 ? (
          <GlassCard>
            <Box textAlign="center" py={6}>
              <Text color="gray.500" mb={3}>No loans added yet.</Text>
              <GradientButton size="sm" onClick={openAdd}>Add your first loan</GradientButton>
            </Box>
          </GlassCard>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {loans?.map(loan => {
              const repaidPct = Math.round(
                ((loan.loan_amount - loan.outstanding_balance) / loan.loan_amount) * 100
              );
              return (
                <GlassCard key={loan.id} p={3}>
                  {/* ── Header row ── */}
                  <HStack justify="space-between" mb={2}>
                    <HStack spacing={2} flex={1} minW={0}>
                      <Badge colorScheme={LOAN_TYPE_COLORS[loan.loan_type] ?? 'gray'} fontSize="10px" flexShrink={0}>
                        {loan.loan_type}
                      </Badge>
                      <Text fontWeight="semibold" fontSize="sm" noOfLines={1}>{loan.bank_name}</Text>
                      {loan.loan_account_number && (
                        <Text fontSize="10px" color="gray.400" fontFamily="mono" noOfLines={1}>
                          #{loan.loan_account_number}
                        </Text>
                      )}
                    </HStack>
                    <HStack spacing={0} flexShrink={0}>
                      {loan.is_floating && (
                        <>
                          <Tooltip label="Update interest rate" hasArrow>
                            <IconButton aria-label="Update rate" icon={<Text fontSize="xs">📈</Text>} size="xs" variant="ghost" colorScheme="cyan" onClick={() => openRateChange(loan)} />
                          </Tooltip>
                          <Tooltip label="Detect rate changes from statement" hasArrow>
                            <IconButton aria-label="From statement" icon={<Text fontSize="xs">📋</Text>} size="xs" variant="ghost" colorScheme="teal" onClick={() => openDetect(loan)} />
                          </Tooltip>
                        </>
                      )}
                      {loan.repayment_type === 'bullet' && (
                        <>
                          <Tooltip label="Pay partial interest" hasArrow>
                            <IconButton aria-label="Pay interest" icon={<Text fontSize="xs">💰</Text>} size="xs" variant="ghost" colorScheme="yellow"
                              onClick={() => { setPayInterestLoan(loan); setPayInterestDate(new Date().toISOString().split('T')[0]); setPayInterestAmount(String(Math.round(loan.accrued_interest / 100))); onPayInterestOpen(); }} />
                          </Tooltip>
                          <Tooltip label="Close gold loan" hasArrow>
                            <IconButton aria-label="Close loan" icon={<Text fontSize="xs">🔒</Text>} size="xs" variant="ghost" colorScheme="red" onClick={() => openForeclose(loan)} />
                          </Tooltip>
                        </>
                      )}
                      {loan.repayment_type !== 'bullet' && (
                        <>
                          <Tooltip label="Part payment / prepayment" hasArrow>
                            <IconButton aria-label="Part pay" icon={<Text fontSize="xs">💳</Text>} size="xs" variant="ghost" colorScheme="green"
                              onClick={() => {
                                setPrepayLoan(loan);
                                setPrepayAmount('');
                                setPrepayDate(new Date().toISOString().split('T')[0]);
                                setPrepaySimulation(null);
                                setPrepayMode('tenure_reduce');
                                onPrepayOpen();
                              }} />
                          </Tooltip>
                          <Tooltip label="View repayment schedule" hasArrow>
                            <IconButton aria-label="View schedule" icon={<Text fontSize="xs">📅</Text>} size="xs" variant="ghost" colorScheme="purple" onClick={() => openSchedule(loan)} />
                          </Tooltip>
                        </>
                      )}
                      <Tooltip label="Upload bank schedule" hasArrow>
                        <IconButton aria-label="Upload" icon={<Text fontSize="xs">📤</Text>} size="xs" variant="ghost" colorScheme="teal" onClick={() => openUpload(loan)} />
                      </Tooltip>
                      <Tooltip label="Edit" hasArrow>
                        <IconButton aria-label="Edit" icon={<Text fontSize="xs">✏️</Text>} size="xs" variant="ghost" colorScheme="blue" onClick={() => openEdit(loan)} />
                      </Tooltip>
                      <Tooltip label="Delete" hasArrow>
                        <IconButton aria-label="Delete" icon={<Text fontSize="xs">🗑️</Text>} size="xs" variant="ghost" colorScheme="red" onClick={() => openDelete(loan)} />
                      </Tooltip>
                    </HStack>
                  </HStack>

                  {/* ── Stats strip ── */}
                  {loan.repayment_type === 'bullet' ? (
                    /* Gold loan stats */
                    <Box>
                      <SimpleGrid columns={4} spacing={2} mb={2}>
                        <Box>
                          <Text fontSize="10px" color="gray.500">Principal</Text>
                          <Text fontWeight="bold" fontSize="xs" color="red.500">{formatINR(loan.outstanding_balance)}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="10px" color="gray.500">Accrued</Text>
                          <Text fontWeight="bold" fontSize="xs" color="orange.500">{formatINR(loan.accrued_interest)}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="10px" color="gray.500">Total Due</Text>
                          <Text fontWeight="bold" fontSize="xs" color="red.600">{formatINR(loan.outstanding_balance + loan.accrued_interest)}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="10px" color="gray.500">Rate</Text>
                          <Text fontWeight="semibold" fontSize="xs">{loan.interest_rate}% p.a.</Text>
                        </Box>
                      </SimpleGrid>
                      {(() => {
                        const dueDate = new Date(new Date(loan.start_date).setFullYear(new Date(loan.start_date).getFullYear() + 1));
                        const daysUntilDue = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        const fromDate = loan.last_interest_payment_date ? new Date(loan.last_interest_payment_date) : new Date(loan.start_date);
                        const daysSince = Math.floor((Date.now() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <HStack fontSize="10px" color={daysUntilDue < 30 ? 'red.500' : 'yellow.700'} spacing={1}>
                            <Text>{daysSince}d since {loan.last_interest_payment_date ? 'payment' : 'start'}</Text>
                            <Text>·</Text>
                            <Text fontWeight={daysUntilDue < 30 ? 'semibold' : 'normal'}>
                              {daysUntilDue > 0 ? `${daysUntilDue} days left` : `Overdue ${Math.abs(daysUntilDue)}d`}
                            </Text>
                            <Text>· Due {formatDate(dueDate.toISOString().split('T')[0])}</Text>
                            {loan.total_interest_paid > 0 && <Text>· Paid {formatINR(loan.total_interest_paid)}</Text>}
                          </HStack>
                        );
                      })()}
                    </Box>
                  ) : (
                    /* EMI loan stats */
                    <SimpleGrid columns={4} spacing={2} mb={2}>
                      <Box>
                        <Text fontSize="10px" color="gray.500">Outstanding</Text>
                        <Text fontWeight="bold" fontSize="xs" color="red.500">{formatINR(loan.outstanding_balance)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="10px" color="gray.500">EMI / month</Text>
                        <Text fontWeight="bold" fontSize="xs">{formatINR(loan.emi_amount)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="10px" color="gray.500">Rate</Text>
                        <HStack spacing={1} align="center">
                          <Text fontWeight="semibold" fontSize="xs">{loan.interest_rate}%</Text>
                          {loan.is_floating && <Badge colorScheme="cyan" fontSize="8px" variant="subtle">float</Badge>}
                        </HStack>
                      </Box>
                      <Box>
                        <Text fontSize="10px" color="gray.500">Left</Text>
                        <Text fontWeight="semibold" fontSize="xs">{loan.remaining_tenure} mo</Text>
                      </Box>
                    </SimpleGrid>
                  )}

                  {/* Rate history timeline for floating loans */}
                  {loan.is_floating && (
                    <RateHistoryTimeline
                      loanId={loan.id}
                      currentRate={loan.interest_rate}
                      startingRate={loan.starting_interest_rate ?? undefined}
                      outstandingBalance={loan.outstanding_balance}
                      remainingTenure={loan.remaining_tenure}
                      onReimport={() => { setDetectLoan(loan); onDetectOpen(); }}
                    />
                  )}

                  {/* Repaid progress */}
                  <HStack justify="space-between" mb={0.5} mt={loan.is_floating ? 2 : 0}>
                    <Text fontSize="10px" color="gray.400">Repaid {repaidPct}%</Text>
                    <Text fontSize="10px" color="gray.400">{formatINR(loan.loan_amount - loan.outstanding_balance)} of {formatINR(loan.loan_amount)}</Text>
                  </HStack>
                  <Progress value={repaidPct} colorScheme="green" size="xs" borderRadius="full" />
                </GlassCard>
              );
            })}
          </SimpleGrid>
        )}

        {/* Debt Strategy Planner */}
        {loans && loans.length > 0 && <DebtStrategyPlanner loans={loans} onForeclose={openForeclose} />}
      </VStack>

      {/* Add / Edit Loan Modal */}
      <Modal isOpen={isFormOpen} onClose={handleFormClose} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>{isEditMode ? 'Edit Loan' : 'Add Loan'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Loan Type</FormLabel>
                <Select placeholder="Select type" {...register('loan_type', { required: true })}>
                  <option value="personal">Personal</option>
                  <option value="home">Home</option>
                  <option value="car">Car / Vehicle</option>
                  <option value="education">Education</option>
                  <option value="gold">Gold</option>
                  <option value="other">Other</option>
                </Select>
              </FormControl>

              {/* Bullet loan toggle — shown when Gold is selected */}
              {watchedLoanType === 'gold' && (
                <Box p={3} bg="yellow.50" borderRadius="md" border="1px solid" borderColor="yellow.300">
                  <HStack justify="space-between">
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontWeight="semibold" color="yellow.800">Bullet Repayment (Gold Loan)</Text>
                      <Text fontSize="xs" color="yellow.700">No monthly EMI — pay Principal + Interest at closure</Text>
                    </VStack>
                    <Switch
                      colorScheme="yellow"
                      isChecked={isBullet}
                      onChange={e => setValue('repayment_type', e.target.checked ? 'bullet' : 'emi')}
                    />
                  </HStack>
                  {isBullet && (
                    <Text fontSize="xs" color="yellow.700" mt={2}>
                      Interest = Principal × Rate × Days / 365 (simple interest, calculated daily)
                    </Text>
                  )}
                </Box>
              )}

              <FormControl isRequired>
                <FormLabel fontSize="sm">Bank / Lender</FormLabel>
                <Input placeholder="e.g. SBI" {...register('bank_name', { required: true })} />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Loan Account Number</FormLabel>
                <Input placeholder="e.g. 37364589012" {...register('loan_account_number')} />
                <Text fontSize="xs" color="gray.400" mt={0.5}>Found on your passbook or statement header</Text>
              </FormControl>

              <SimpleGrid columns={2} spacing={3} w="full">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Loan Amount (₹)</FormLabel>
                  <NumberInput min={1}>
                    <NumberInputField placeholder="e.g. 2450000" {...register('loan_amount', { required: true })} />
                  </NumberInput>
                  {previewINR(watchedLoanAmount) && (
                    <Text fontSize="xs" color="purple.500" mt={0.5} fontWeight="medium">
                      = {previewINR(watchedLoanAmount)}
                    </Text>
                  )}
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Outstanding (₹)</FormLabel>
                  <NumberInput min={0}>
                    <NumberInputField placeholder="e.g. 2185291" {...register('outstanding_balance', { required: true })} />
                  </NumberInput>
                  {previewINR(watchedOutstanding) && (
                    <Text fontSize="xs" color="purple.500" mt={0.5} fontWeight="medium">
                      = {previewINR(watchedOutstanding)}
                    </Text>
                  )}
                </FormControl>
                {watchedIsFloating && (
                  <FormControl isRequired>
                    <FormLabel fontSize="sm">Starting Interest Rate (%)</FormLabel>
                    <NumberInput min={0} step={0.1}>
                      <NumberInputField placeholder="8.5" {...register('starting_interest_rate', { required: watchedIsFloating })} />
                    </NumberInput>
                    {isEditMode && editingLoan?.starting_interest_rate == null ? (
                      <Text fontSize="xs" color="orange.500" mt={0.5} fontWeight="medium">
                        Not set — enter the rate when this loan was first taken (e.g. 8.5)
                      </Text>
                    ) : (
                      <Text fontSize="xs" color="gray.500" mt={0.5}>Rate when the loan was first taken</Text>
                    )}
                  </FormControl>
                )}
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Interest Rate (%)</FormLabel>
                  <NumberInput min={0} step={0.1}>
                    <NumberInputField placeholder={watchedIsFloating ? '7.25' : '10.5'} {...register('interest_rate', { required: true })} />
                  </NumberInput>
                  {watchedIsFloating && (
                    <Text fontSize="xs" color="gray.500" mt={0.5}>Current rate today</Text>
                  )}
                </FormControl>
                {!isBullet && (
                  <>
                    <FormControl isRequired>
                      <FormLabel fontSize="sm">Total Tenure (months)</FormLabel>
                      <NumberInput min={1}>
                        <NumberInputField placeholder="60" {...register('tenure_months', { required: !isBullet })} />
                      </NumberInput>
                    </FormControl>
                    <FormControl isRequired={isEditMode}>
                      <FormLabel fontSize="sm">
                        Remaining Tenure (months)
                        {!isEditMode && <Text as="span" fontSize="xs" color="gray.400" fontWeight="normal"> — optional for new loans</Text>}
                      </FormLabel>
                      <NumberInput min={0}>
                        <NumberInputField placeholder={isEditMode ? '210' : 'leave blank if just started'} {...register('remaining_tenure')} />
                      </NumberInput>
                      <Text fontSize="xs" color="orange.500" mt={0.5}>
                        Use the number from your latest bank statement — this is the source of truth
                      </Text>
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="sm">Actual EMI (₹) <Text as="span" fontSize="xs" color="gray.400" fontWeight="normal">optional</Text></FormLabel>
                      <NumberInput min={1}>
                        <NumberInputField placeholder="Auto-computed if left blank" {...register('emi_amount')} />
                      </NumberInput>
                      {previewINR(watchedEmi) && (
                        <Text fontSize="xs" color="purple.500" mt={0.5} fontWeight="medium">
                          = {previewINR(watchedEmi)} / month
                        </Text>
                      )}
                      <FormHelperText fontSize="xs" color="gray.500">
                        Enter your bank's EMI if it differs from the computed value.
                      </FormHelperText>
                    </FormControl>
                  </>
                )}
              </SimpleGrid>

              <FormControl isRequired>
                <FormLabel fontSize="sm">Loan Disbursement Date</FormLabel>
                <Input type="date" {...register('start_date', { required: true })} />
                <FormHelperText fontSize="xs" color="gray.500">
                  Date the loan was sanctioned/credited to your account.
                  First EMI falls one month after this date.
                </FormHelperText>
              </FormControl>

              <FormControl>
                <HStack justify="space-between" align="center"
                  p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.100">
                  <Box>
                    <FormLabel mb={0} fontSize="sm" fontWeight="semibold" color="blue.700">
                      Floating Interest Rate
                    </FormLabel>
                    <Text fontSize="xs" color="blue.600">
                      Rate changes with RBI repo rate (e.g. Home loans)
                    </Text>
                  </Box>
                  <Switch
                    colorScheme="blue"
                    size="md"
                    {...register('is_floating')}
                  />
                </HStack>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={handleFormClose}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={isSubmitting || isBusy}>
              {isEditMode ? 'Save Changes' : 'Add Loan'}
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation */}
      <AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelDeleteRef} onClose={onDeleteClose}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">Delete Loan</AlertDialogHeader>
            <AlertDialogBody>
              Delete <strong>{loanToDelete?.bank_name}</strong>? This will also remove the full
              repayment schedule. This action cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelDeleteRef} onClick={onDeleteClose} size="sm">Cancel</Button>
              <Button
                colorScheme="red" size="sm"
                isLoading={deleteMutation.isPending}
                onClick={() => loanToDelete && deleteMutation.mutate(loanToDelete.id)}
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {/* Repayment Schedule Modal */}
      <Modal isOpen={isScheduleOpen} onClose={onScheduleClose} size="4xl" scrollBehavior="inside">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            Repayment Schedule
            {selectedLoan && (
              <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={1}>
                {selectedLoan.bank_name} — {formatINR(selectedLoan.outstanding_balance)} outstanding
              </Text>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {schedLoading ? (
              <Box textAlign="center" p={8}><Spinner color="purple.500" /></Box>
            ) : (
              <TableContainer>
                <Table size="sm">
                  <Thead bg="gray.50" position="sticky" top={0}>
                    <Tr>
                      <Th>#</Th>
                      <Th>Due Date</Th>
                      <Th isNumeric>Principal</Th>
                      <Th isNumeric>Interest</Th>
                      <Th isNumeric>Balance</Th>
                      <Th>Status — click to toggle</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {schedule?.map(row => (
                      <Tr key={row.id} opacity={row.paid ? 0.55 : 1}>
                        <Td fontSize="xs">{row.emi_number}</Td>
                        <Td fontSize="xs">{formatDate(row.due_date)}</Td>
                        <Td isNumeric fontSize="xs">{formatINR(row.principal)}</Td>
                        <Td isNumeric fontSize="xs" color="orange.600">{formatINR(row.interest)}</Td>
                        <Td isNumeric fontSize="xs">{formatINR(row.outstanding_balance)}</Td>
                        <Td>
                          <Tooltip label={row.paid ? 'Click to mark Pending' : 'Click to mark Paid'} hasArrow>
                            <Badge
                              colorScheme={row.paid ? 'green' : 'gray'}
                              fontSize="xs"
                              variant={row.paid ? 'solid' : 'subtle'}
                              cursor="pointer"
                              userSelect="none"
                              px={2}
                              py={0.5}
                              borderRadius="full"
                              _hover={{ opacity: 0.7 }}
                              onClick={() => selectedLoan && togglePaidMutation.mutate({ loanId: selectedLoan.id, rowId: row.id })}
                            >
                              {row.paid ? '✓ Paid' : 'Pending'}
                            </Badge>
                          </Tooltip>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            )}
          </ModalBody>
          <ModalFooter>
            <Button size="sm" onClick={onScheduleClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Upload Bank Schedule Modal */}
      <Modal isOpen={isUploadOpen} onClose={onUploadClose} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            Upload Repayment Schedule
            {uploadLoan && (
              <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={1}>
                {uploadLoan.bank_name} — replaces the existing schedule
              </Text>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Text fontSize="sm" color="gray.600">
                Upload the repayment schedule given by your bank. Supported formats: PDF, Excel (.xls, .xlsx), or CSV.
              </Text>
              <Box
                border="2px dashed"
                borderColor={uploadFile ? 'purple.400' : 'gray.300'}
                borderRadius="md"
                p={6}
                textAlign="center"
                cursor="pointer"
                _hover={{ borderColor: 'purple.400', bg: 'purple.50' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Text fontSize="2xl" mb={2}>{uploadFile ? '✅' : '📁'}</Text>
                {uploadFile ? (
                  <Text fontSize="sm" fontWeight="medium" color="purple.600">{uploadFile.name}</Text>
                ) : (
                  <Text fontSize="sm" color="gray.500">Click to select file</Text>
                )}
                <Text fontSize="xs" color="gray.400" mt={1}>.pdf · .xls · .xlsx · .csv</Text>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx,.csv,.pdf"
                  style={{ display: 'none' }}
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                />
              </Box>
              <Text fontSize="xs" color="orange.600">
                This will replace the entire existing schedule for this loan.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onUploadClose}>Cancel</Button>
            <GradientButton
              size="sm"
              isDisabled={!uploadFile}
              isLoading={uploadMutation.isPending}
              onClick={() => uploadLoan && uploadFile && uploadMutation.mutate({ id: uploadLoan.id, file: uploadFile })}
            >
              Import Schedule
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Foreclose / Close Loan Modal */}
      <Modal isOpen={isForecloseOpen} onClose={onForecloseClose} size="sm">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            {forecloseLoan?.repayment_type === 'bullet' ? 'Close Gold Loan' : 'Close Loan Early'}
            {forecloseLoan && (
              <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={1}>
                {forecloseLoan.bank_name} — {forecloseLoan.loan_account_number || forecloseLoan.loan_type}
              </Text>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {forecloseLoan && forecloseLoan.repayment_type === 'bullet' ? (
              /* ── Gold loan closure ── */
              <VStack spacing={4} align="stretch">
                <Box p={3} bg="yellow.50" borderRadius="md" border="1px solid" borderColor="yellow.200">
                  <Text fontSize="xs" color="yellow.700" mb={2} fontWeight="semibold">
                    Payment Breakdown on Closure Date
                  </Text>
                  <SimpleGrid columns={3} spacing={2} textAlign="center">
                    <Box>
                      <Text fontSize="xs" color="gray.500">Principal</Text>
                      <Text fontWeight="bold" color="red.600">{formatINR(forecloseLoan.outstanding_balance)}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">+ Interest</Text>
                      <Text fontWeight="bold" color="orange.500">{formatINR(forecloseLoan.accrued_interest)}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">= Total</Text>
                      <Text fontWeight="bold" color="red.700" fontSize="md">
                        {formatINR(forecloseLoan.outstanding_balance + forecloseLoan.accrued_interest)}
                      </Text>
                    </Box>
                  </SimpleGrid>
                  {forecloseLoan.total_interest_paid > 0 && (
                    <Text fontSize="xs" color="yellow.700" mt={2} textAlign="center">
                      Already paid in interest: {formatINR(forecloseLoan.total_interest_paid)}
                    </Text>
                  )}
                </Box>

                <FormControl>
                  <FormLabel fontSize="sm">Closure Date</FormLabel>
                  <Input type="date" value={forecloseDate} onChange={e => setForecloseDate(e.target.value)} />
                  <FormHelperText fontSize="xs" color="gray.500">
                    Date you returned the gold and settled the loan.
                  </FormHelperText>
                </FormControl>

                <Text fontSize="xs" color="orange.600" bg="orange.50" p={2} borderRadius="md">
                  This calculates final interest to the closure date, records it, and marks the loan as closed.
                  Confirm only after the bank confirms receipt.
                </Text>
              </VStack>
            ) : forecloseLoan ? (
              /* ── Regular EMI loan early closure ── */
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={2} spacing={3}>
                  <Box bg="red.50" borderRadius="md" p={3} textAlign="center">
                    <Text fontSize="xs" color="gray.500" mb={1}>Pay Today</Text>
                    <Text fontWeight="bold" color="red.600" fontSize="md">
                      {formatINR(forecloseLoan.outstanding_balance)}
                    </Text>
                  </Box>
                  <Box bg="green.50" borderRadius="md" p={3} textAlign="center">
                    <Text fontSize="xs" color="gray.500" mb={1}>Interest Saved</Text>
                    <Text fontWeight="bold" color="green.600" fontSize="md">
                      {formatINR(forecloseLoan.total_interest_payable)}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Box bg="blue.50" borderRadius="md" p={3}>
                  <SimpleGrid columns={2} spacing={2}>
                    <Box>
                      <Text fontSize="xs" color="gray.500">EMIs Saved</Text>
                      <Text fontWeight="semibold">{forecloseLoan.remaining_tenure} months</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Last EMI Would Be</Text>
                      <Text fontWeight="semibold">{formatDate(computeLastEmiDate(forecloseLoan))}</Text>
                    </Box>
                  </SimpleGrid>
                </Box>

                <FormControl>
                  <FormLabel fontSize="sm">Prepayment Date</FormLabel>
                  <Input type="date" value={forecloseDate} onChange={e => setForecloseDate(e.target.value)} />
                  <FormHelperText fontSize="xs" color="gray.500">
                    Date you made or will make the payment to the bank.
                  </FormHelperText>
                </FormControl>

                <Text fontSize="xs" color="orange.600" bg="orange.50" p={2} borderRadius="md">
                  This records a full prepayment and marks the loan as closed.
                  Confirm only after actually paying the bank.
                </Text>
              </VStack>
            ) : null}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onForecloseClose}>Cancel</Button>
            {forecloseLoan?.repayment_type === 'bullet' ? (
              <Button
                colorScheme="yellow"
                size="sm"
                isLoading={goldClosureMutation.isPending}
                isDisabled={!forecloseDate}
                onClick={() => forecloseLoan && goldClosureMutation.mutate({ id: forecloseLoan.id, closeDate: forecloseDate })}
              >
                Close & Return Gold
              </Button>
            ) : (
              <Button
                colorScheme="green"
                size="sm"
                isLoading={closureMutation.isPending}
                isDisabled={!forecloseDate}
                onClick={() =>
                  forecloseLoan &&
                  closureMutation.mutate({
                    id: forecloseLoan.id,
                    amount: forecloseLoan.outstanding_balance,
                    payDate: forecloseDate,
                  })
                }
              >
                Confirm Closure
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Rate Change Modal */}
      <Modal isOpen={isRateOpen} onClose={onRateClose} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent as="form" onSubmit={rateForm.handleSubmit((data) => {
          if (!rateChangeLoan) return;
          rateChangeMutation.mutate({
            id: rateChangeLoan.id,
            data: {
              new_rate: parseFloat(data.new_rate),
              effective_date: data.effective_date,
              adjust_type: rateAdjustType,
              note: data.note || null,
            },
          });
        })}>
          <ModalHeader fontSize="md">
            Update Interest Rate
            {rateChangeLoan && (
              <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={0.5}>
                {rateChangeLoan.bank_name} · {rateChangeLoan.loan_type} loan
              </Text>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">

              {/* Current → New rate display */}
              {rateChangeLoan && (
                <HStack justify="space-around" p={3} bg="gray.50" borderRadius="md">
                  <Box textAlign="center">
                    <Text fontSize="xs" color="gray.500" mb={1}>Current Rate</Text>
                    <Text fontSize="2xl" fontWeight="bold" color="gray.700">{rateChangeLoan.interest_rate}%</Text>
                  </Box>
                  <Text fontSize="xl" color="gray.400">→</Text>
                  <Box textAlign="center">
                    <Text fontSize="xs" color="gray.500" mb={1}>New Rate</Text>
                    <Text fontSize="2xl" fontWeight="bold" color="cyan.600">
                      {(() => { const v = parseFloat(rateForm.watch('new_rate')); return isNaN(v) ? '—' : `${v}%`; })()}
                    </Text>
                  </Box>
                </HStack>
              )}

              {/* Inputs */}
              <SimpleGrid columns={2} spacing={3}>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">New Rate (%)</FormLabel>
                  <NumberInput min={1} max={30} step={0.25} precision={2}>
                    <NumberInputField
                      placeholder="e.g. 8.00"
                      {...rateForm.register('new_rate', { required: true })}
                    />
                  </NumberInput>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Effective From</FormLabel>
                  <Input type="date" {...rateForm.register('effective_date', { required: true })} />
                </FormControl>
              </SimpleGrid>

              {/* Adjustment type — simple toggle buttons */}
              <FormControl>
                <FormLabel fontSize="sm">How does your bank adjust?</FormLabel>
                <HStack spacing={2}>
                  <Button
                    size="sm" flex={1}
                    colorScheme={rateAdjustType === 'tenure' ? 'cyan' : 'gray'}
                    variant={rateAdjustType === 'tenure' ? 'solid' : 'outline'}
                    onClick={() => setRateAdjustType('tenure')}
                  >
                    Change Tenure
                  </Button>
                  <Button
                    size="sm" flex={1}
                    colorScheme={rateAdjustType === 'emi' ? 'purple' : 'gray'}
                    variant={rateAdjustType === 'emi' ? 'solid' : 'outline'}
                    onClick={() => setRateAdjustType('emi')}
                  >
                    Change EMI
                  </Button>
                </HStack>
                <Text fontSize="xs" color="gray.400" mt={1}>
                  {rateAdjustType === 'tenure'
                    ? 'Indian default — EMI stays same, loan duration changes'
                    : 'EMI changes, loan duration stays same'}
                </Text>
              </FormControl>

              {/* Live calculation preview */}
              {rateChangeLoan && (() => {
                const newRateVal = parseFloat(rateForm.watch('new_rate'));
                if (isNaN(newRateVal) || newRateVal <= 0) return null;
                const r = newRateVal / 12 / 100;
                const emi = rateChangeLoan.emi_amount;
                const principal = rateChangeLoan.outstanding_balance;
                const currentTenure = rateChangeLoan.remaining_tenure;

                if (rateAdjustType === 'tenure') {
                  let newTenure = currentTenure;
                  if (r > 0 && emi > principal * r) {
                    newTenure = Math.ceil(Math.log(emi / (emi - principal * r)) / Math.log(1 + r));
                  }
                  const diff = newTenure - currentTenure;
                  const isGood = diff < 0;
                  return (
                    <Box p={3} bg={isGood ? 'green.50' : 'orange.50'} borderRadius="md"
                      borderLeft="3px solid" borderColor={isGood ? 'green.400' : 'orange.400'}>
                      <Text fontSize="xs" color="gray.500" mb={2} fontWeight="semibold">Impact on your loan</Text>
                      <HStack justify="space-between">
                        <Box>
                          <Text fontSize="xs" color="gray.500">Your EMI stays</Text>
                          <Text fontWeight="bold" fontSize="sm">₹{(emi / 100).toLocaleString('en-IN')}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color="gray.500">Tenure changes</Text>
                          <Text fontWeight="bold" fontSize="sm" color={isGood ? 'green.600' : 'orange.600'}>
                            {currentTenure} → {newTenure} mo
                          </Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color="gray.500">{isGood ? 'You save' : 'Extra'}</Text>
                          <Text fontWeight="bold" fontSize="sm" color={isGood ? 'green.600' : 'orange.600'}>
                            {Math.abs(diff)} months
                          </Text>
                        </Box>
                      </HStack>
                    </Box>
                  );
                } else {
                  const pow = Math.pow(1 + r, currentTenure);
                  const newEmi = Math.round(principal * r * pow / (pow - 1));
                  const diff = newEmi - emi;
                  const isGood = diff < 0;
                  return (
                    <Box p={3} bg={isGood ? 'green.50' : 'orange.50'} borderRadius="md"
                      borderLeft="3px solid" borderColor={isGood ? 'green.400' : 'orange.400'}>
                      <Text fontSize="xs" color="gray.500" mb={2} fontWeight="semibold">Impact on your loan</Text>
                      <HStack justify="space-between">
                        <Box>
                          <Text fontSize="xs" color="gray.500">Tenure stays</Text>
                          <Text fontWeight="bold" fontSize="sm">{currentTenure} months</Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color="gray.500">New EMI</Text>
                          <Text fontWeight="bold" fontSize="sm" color={isGood ? 'green.600' : 'orange.600'}>
                            ₹{(newEmi / 100).toLocaleString('en-IN')}
                          </Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color="gray.500">{isGood ? 'Saves' : 'Extra'}</Text>
                          <Text fontWeight="bold" fontSize="sm" color={isGood ? 'green.600' : 'orange.600'}>
                            ₹{Math.abs(Math.round(diff / 100)).toLocaleString('en-IN')}/mo
                          </Text>
                        </Box>
                      </HStack>
                    </Box>
                  );
                }
              })()}

              {/* Optional note */}
              <FormControl>
                <FormLabel fontSize="sm">
                  Note{' '}
                  <Text as="span" fontSize="xs" color="gray.400" fontWeight="normal">optional</Text>
                </FormLabel>
                <Input
                  placeholder="e.g. RBI repo rate cut Oct 2024"
                  size="sm"
                  {...rateForm.register('note')}
                />
              </FormControl>

            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onRateClose}>Cancel</Button>
            <GradientButton type="submit" size="sm" isLoading={rateChangeMutation.isPending}>
              Save Rate Change
            </GradientButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Detect Rate Changes from Statement ── */}
      <Modal isOpen={isDetectOpen} onClose={onDetectClose} size="lg">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader fontSize="md">
            Auto-Detect Rate Changes
            {detectLoan && (
              <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={0.5}>
                Upload your SBI/ICICI/HDFC bank statement — rate changes are found automatically
              </Text>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {detectStep === 'upload' ? (
              <VStack spacing={4} align="stretch">
                <Box p={3} bg="teal.50" borderRadius="md" borderLeft="3px solid" borderColor="teal.400">
                  <Text fontSize="xs" color="teal.700" fontWeight="semibold" mb={1}>
                    How it works
                  </Text>
                  <Text fontSize="xs" color="teal.600">
                    Select all your SBI account statements at once (one per financial year).
                    The app scans every file for <strong>"RATE CHANGED FM 7.500% TO 7.250%"</strong> entries
                    and combines the results automatically.
                  </Text>
                </Box>

                <Box
                  border="2px dashed"
                  borderColor={detectFiles.length > 0 ? 'teal.400' : 'teal.200'}
                  borderRadius="md"
                  p={6}
                  textAlign="center"
                  cursor="pointer"
                  bg={detectFiles.length > 0 ? 'teal.50' : 'white'}
                  _hover={{ borderColor: 'teal.400', bg: 'teal.50' }}
                  onClick={() => detectFileRef.current?.click()}
                >
                  <Text fontSize="2xl" mb={2}>{detectFiles.length > 0 ? '📂' : '📄'}</Text>
                  {detectFiles.length === 0 ? (
                    <>
                      <Text fontSize="sm" fontWeight="semibold" color="teal.700">
                        Click to select bank statements
                      </Text>
                      <Text fontSize="xs" color="gray.400" mt={1}>PDF, CSV — select multiple files at once</Text>
                    </>
                  ) : (
                    <VStack spacing={1}>
                      <Text fontSize="sm" fontWeight="semibold" color="teal.700">
                        {detectFiles.length} file{detectFiles.length > 1 ? 's' : ''} selected
                      </Text>
                      {detectFiles.map((f, i) => (
                        <Text key={i} fontSize="xs" color="teal.600">
                          {f.name}
                        </Text>
                      ))}
                      <Text fontSize="xs" color="gray.400" mt={1}>Click to change selection</Text>
                    </VStack>
                  )}
                  <input
                    ref={detectFileRef}
                    type="file"
                    accept=".pdf,.csv"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => setDetectFiles(Array.from(e.target.files ?? []))}
                  />
                </Box>

                <FormControl>
                  <FormLabel fontSize="sm">
                    PDF Password{' '}
                    <Text as="span" fontSize="xs" color="gray.400" fontWeight="normal">
                      (SBI/ICICI = date of birth, e.g. 22081986)
                    </Text>
                  </FormLabel>
                  <Input
                    size="sm"
                    type="password"
                    placeholder="Leave blank if not password-protected"
                    value={detectPassword}
                    onChange={e => setDetectPassword(e.target.value)}
                  />
                </FormControl>
              </VStack>
            ) : !Array.isArray(detectedChanges) ? null : (
              <VStack spacing={3} align="stretch">
                {statementTenure && (
                  <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.300">
                    <Text fontSize="xs" fontWeight="bold" color="blue.700" mb={1}>
                      Found in statement — will be applied automatically
                    </Text>
                    <HStack spacing={4}>
                      <Text fontSize="sm" color="blue.800">
                        Remaining: <strong>{statementTenure.remaining_tenure} months</strong>
                        {detectLoan && detectLoan.remaining_tenure !== statementTenure.remaining_tenure && (
                          <Text as="span" color="orange.600" ml={1} fontSize="xs">
                            (was {detectLoan.remaining_tenure})
                          </Text>
                        )}
                      </Text>
                      {statementTenure.outstanding_balance_paise && (
                        <Text fontSize="sm" color="blue.800">
                          Balance: <strong>₹{Math.round(statementTenure.outstanding_balance_paise / 100).toLocaleString('en-IN')}</strong>
                        </Text>
                      )}
                    </HStack>
                  </Box>
                )}
                {detectedChanges.some(c => c.already_recorded) && (
                  <Box p={2} bg="yellow.50" borderRadius="md" border="1px solid" borderColor="yellow.300">
                    <Text fontSize="xs" color="yellow.700">
                      Greyed out entries are already recorded in your rate history.
                    </Text>
                  </Box>
                )}
                {detectedChanges.map((c, i) => (
                  <HStack
                    key={i}
                    p={3}
                    borderRadius="md"
                    border="1px solid"
                    borderColor={c.already_recorded ? 'gray.200' : (c.new_rate < c.old_rate ? 'green.200' : 'orange.200')}
                    bg={c.already_recorded ? 'gray.50' : (c.new_rate < c.old_rate ? 'green.50' : 'orange.50')}
                    opacity={c.already_recorded ? 0.6 : 1}
                    justify="space-between"
                  >
                    <VStack align="start" spacing={0}>
                      <HStack spacing={2}>
                        <Text fontSize="sm" fontWeight="bold" color={c.new_rate < c.old_rate ? 'green.700' : 'orange.700'}>
                          {c.old_rate}% → {c.new_rate}%
                        </Text>
                        {c.already_recorded && (
                          <Badge colorScheme="gray" fontSize="9px">Already saved</Badge>
                        )}
                        {!c.already_recorded && (
                          <Badge colorScheme={c.new_rate < c.old_rate ? 'green' : 'orange'} fontSize="9px">
                            {c.new_rate < c.old_rate ? 'Rate fell ↓' : 'Rate rose ↑'}
                          </Badge>
                        )}
                      </HStack>
                      <Text fontSize="xs" color="gray.500">
                        {c.effective_date
                          ? new Date(c.effective_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                          : 'Date not found'}
                      </Text>
                    </VStack>
                    <Text fontSize="xs" color="gray.400">Tenure adjusts</Text>
                  </HStack>
                ))}

                {detectedChanges.filter(c => !c.already_recorded).length === 0 && (
                  <Box p={3} bg="blue.50" borderRadius="md" textAlign="center">
                    <Text fontSize="sm" color="blue.700">
                      All detected changes are already saved. Nothing new to apply.
                    </Text>
                  </Box>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            {detectStep === 'upload' ? (
              <>
                <Button variant="ghost" size="sm" onClick={onDetectClose}>Cancel</Button>
                <Button
                  colorScheme="teal"
                  size="sm"
                  isDisabled={detectFiles.length === 0}
                  isLoading={detectMutation.isPending}
                  onClick={() => detectLoan && detectFiles.length > 0 && detectMutation.mutate({
                    loan: detectLoan, files: detectFiles, password: detectPassword,
                  })}
                >
                  Scan {detectFiles.length > 1 ? `${detectFiles.length} Files` : 'Statement'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => {
                  setDetectStep('upload');
                  setDetectFiles([]);
                  setDetectedChanges([]);
                }}>
                  Change Files
                </Button>
                <Button
                  colorScheme="teal"
                  size="sm"
                  isDisabled={detectedChanges.filter(c => !c.already_recorded).length === 0}
                  isLoading={applyAllChangesMutation.isPending}
                  onClick={() => {
                    if (!detectLoan) return;
                    let manualTenure: number | undefined;
                    // If statement didn't detect remaining tenure, ask user
                    if (!statementTenure) {
                      const input = window.prompt(
                        'How many months are remaining on your loan?\n(Check your latest bank statement for "EMIs outstanding" or "Remaining tenure")',
                        String(detectLoan.remaining_tenure),
                      );
                      if (input === null) return; // user cancelled
                      const parsed = parseInt(input);
                      if (!isNaN(parsed) && parsed > 0) manualTenure = parsed;
                    }
                    applyAllChangesMutation.mutate({
                      loan: detectLoan,
                      changes: detectedChanges.filter(c => !c.already_recorded),
                      manualTenure,
                    });
                  }}
                >
                  Apply {detectedChanges.filter(c => !c.already_recorded).length} New Change(s)
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
      {/* Gold Loan: Pay Interest Modal */}
      <Modal isOpen={isPayInterestOpen} onClose={onPayInterestClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            Pay Partial Interest
            {payInterestLoan && (
              <Text fontSize="sm" color="gray.500" fontWeight="normal">
                {payInterestLoan.bank_name} — {payInterestLoan.loan_account_number || 'Gold Loan'}
              </Text>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              {payInterestLoan && (
                <Box w="full" p={3} bg="yellow.50" borderRadius="md" border="1px solid" borderColor="yellow.200">
                  <SimpleGrid columns={2} spacing={2}>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Accrued Interest</Text>
                      <Text fontWeight="bold" color="orange.500">{formatINR(payInterestLoan.accrued_interest)}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Total Paid So Far</Text>
                      <Text fontWeight="bold">{formatINR(payInterestLoan.total_interest_paid)}</Text>
                    </Box>
                  </SimpleGrid>
                  <Text fontSize="xs" color="yellow.700" mt={1}>
                    After recording this payment, accrued interest will reset from today.
                  </Text>
                </Box>
              )}
              <FormControl isRequired>
                <FormLabel fontSize="sm">Amount Paid (₹)</FormLabel>
                <NumberInput min={1} value={payInterestAmount} onChange={v => setPayInterestAmount(v)}>
                  <NumberInputField placeholder="e.g. 5000" />
                </NumberInput>
                <Text fontSize="xs" color="gray.500" mt={0.5}>Enter amount in rupees</Text>
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Payment Date</FormLabel>
                <Input type="date" value={payInterestDate} onChange={e => setPayInterestDate(e.target.value)} />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Note (optional)</FormLabel>
                <Input placeholder="e.g. Paid at branch" value={payInterestNote} onChange={e => setPayInterestNote(e.target.value)} />
              </FormControl>

              {/* Payment history */}
              {goldPayments && goldPayments.length > 0 && (
                <Box w="full">
                  <Text fontSize="sm" fontWeight="semibold" mb={2}>Payment History</Text>
                  <VStack spacing={2} align="stretch">
                    {goldPayments.map(p => (
                      <HStack key={p.id} justify="space-between" p={2} bg="gray.50" borderRadius="md">
                        <VStack align="start" spacing={0}>
                          <Text fontSize="sm" fontWeight="medium">{formatINR(p.amount)}</Text>
                          <Text fontSize="xs" color="gray.500">{formatDate(p.payment_date)}{p.note ? ` — ${p.note}` : ''}</Text>
                        </VStack>
                        <IconButton
                          aria-label="Delete payment"
                          icon={<Text fontSize="xs">🗑️</Text>}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          isLoading={deleteGoldPaymentMutation.isPending}
                          onClick={() => payInterestLoan && deleteGoldPaymentMutation.mutate({ loanId: payInterestLoan.id, paymentId: p.id })}
                        />
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onPayInterestClose}>Cancel</Button>
            <Button
              colorScheme="yellow"
              isDisabled={!payInterestAmount || !payInterestDate}
              isLoading={goldPaymentMutation.isPending}
              onClick={() => {
                if (!payInterestLoan || !payInterestAmount || !payInterestDate) return;
                const amountPaise = Math.round(parseFloat(payInterestAmount) * 100);
                goldPaymentMutation.mutate({
                  loanId: payInterestLoan.id,
                  amount: amountPaise,
                  payment_date: payInterestDate,
                  note: payInterestNote || undefined,
                });
              }}
            >
              Record Payment
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Part Payment Modal */}
      <Modal isOpen={isPrepayOpen} onClose={onPrepayClose} size="md">
        <ModalOverlay backdropFilter="blur(4px)" />
        <ModalContent>
          <ModalHeader>
            Part Payment
            {prepayLoan && (
              <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={0.5}>
                {prepayLoan.bank_name} — Outstanding {formatINR(prepayLoan.outstanding_balance)}
              </Text>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {prepayLoan && (
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={2} spacing={3}>
                  <FormControl isRequired>
                    <FormLabel fontSize="sm">Amount (₹)</FormLabel>
                    <NumberInput min={1} value={prepayAmount} onChange={v => {
                      setPrepayAmount(v);
                      setPrepaySimulation(null);
                    }}>
                      <NumberInputField placeholder="e.g. 100000" />
                    </NumberInput>
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel fontSize="sm">Payment Date</FormLabel>
                    <Input type="date" value={prepayDate} onChange={e => { setPrepayDate(e.target.value); setPrepaySimulation(null); }} />
                  </FormControl>
                </SimpleGrid>

                {/* Adjust mode */}
                <FormControl>
                  <FormLabel fontSize="sm">How to apply this payment?</FormLabel>
                  <SimpleGrid columns={2} spacing={2}>
                    <Box
                      p={3} borderRadius="md" cursor="pointer"
                      border="2px solid"
                      borderColor={prepayMode === 'tenure_reduce' ? 'green.400' : 'gray.200'}
                      bg={prepayMode === 'tenure_reduce' ? 'green.50' : 'white'}
                      onClick={() => { setPrepayMode('tenure_reduce'); setPrepaySimulation(null); }}
                    >
                      <HStack mb={0.5}>
                        <Text fontSize="sm" fontWeight="semibold" color={prepayMode === 'tenure_reduce' ? 'green.700' : 'gray.700'}>Reduce Tenure</Text>
                        <Badge colorScheme="green" fontSize="9px">Recommended</Badge>
                      </HStack>
                      <Text fontSize="xs" color="gray.500">EMI stays same · Loan closes earlier · Maximum interest savings</Text>
                    </Box>
                    <Box
                      p={3} borderRadius="md" cursor="pointer"
                      border="2px solid"
                      borderColor={prepayMode === 'emi_increase' ? 'blue.400' : 'gray.200'}
                      bg={prepayMode === 'emi_increase' ? 'blue.50' : 'white'}
                      onClick={() => { setPrepayMode('emi_increase'); setPrepaySimulation(null); }}
                    >
                      <Text fontSize="sm" fontWeight="semibold" color={prepayMode === 'emi_increase' ? 'blue.700' : 'gray.700'} mb={0.5}>Reduce EMI</Text>
                      <Text fontSize="xs" color="gray.500">Tenure stays same · Lower monthly outflow</Text>
                    </Box>
                  </SimpleGrid>
                </FormControl>

                {/* Simulate button */}
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="teal"
                  isDisabled={!prepayAmount || parseFloat(prepayAmount) <= 0}
                  isLoading={simLoading}
                  onClick={() => prepayLoan && runSimulation(prepayLoan, prepayAmount, prepayMode)}
                >
                  Preview Impact
                </Button>

                {/* Simulation results */}
                {prepaySimulation && prepayLoan && (() => {
                  const paidPaise = Math.round(parseFloat(prepayAmount) * 100);
                  const newPrincipal = prepayLoan.outstanding_balance - paidPaise;
                  const toYM = (months: number) => {
                    const y = Math.floor(months / 12);
                    const m = months % 12;
                    return y > 0 ? `${y}y ${m}m` : `${m}m`;
                  };
                  return (
                    <Box p={3} bg="green.50" borderRadius="md" border="1px solid" borderColor="green.200">
                      <Text fontSize="xs" fontWeight="semibold" color="green.700" mb={2}>After this payment:</Text>
                      <SimpleGrid columns={2} spacing={3}>
                        <Box>
                          <Text fontSize="10px" color="gray.500">New Principal</Text>
                          <Text fontWeight="bold" fontSize="sm" color="red.600">{formatINR(newPrincipal)}</Text>
                          <Text fontSize="10px" color="gray.400">was {formatINR(prepayLoan.outstanding_balance)}</Text>
                        </Box>
                        {prepayMode === 'tenure_reduce' ? (
                          <>
                            <Box>
                              <Text fontSize="10px" color="gray.500">Tenure Saved</Text>
                              <Text fontWeight="bold" fontSize="sm" color="green.600">−{toYM(prepaySimulation.tenure_reduced)}</Text>
                              <Text fontSize="10px" color="gray.400">{toYM(prepayLoan.remaining_tenure)} → {toYM(prepaySimulation.new_tenure)}</Text>
                            </Box>
                            <Box>
                              <Text fontSize="10px" color="gray.500">EMI (unchanged)</Text>
                              <Text fontWeight="semibold" fontSize="sm">{formatINR(prepayLoan.emi_amount)}</Text>
                            </Box>
                          </>
                        ) : (
                          <>
                            <Box>
                              <Text fontSize="10px" color="gray.500">New EMI</Text>
                              <Text fontWeight="bold" fontSize="sm" color="blue.600">{formatINR(prepaySimulation.new_emi)}</Text>
                              <Text fontSize="10px" color="gray.400">save {formatINR(prepayLoan.emi_amount - prepaySimulation.new_emi)}/mo</Text>
                            </Box>
                            <Box>
                              <Text fontSize="10px" color="gray.500">Tenure (unchanged)</Text>
                              <Text fontWeight="semibold" fontSize="sm">{toYM(prepayLoan.remaining_tenure)}</Text>
                            </Box>
                          </>
                        )}
                        <Box>
                          <Text fontSize="10px" color="gray.500">Interest Saved</Text>
                          <Text fontWeight="bold" fontSize="sm" color="green.700">{formatINR(prepaySimulation.interest_saved)}</Text>
                        </Box>
                      </SimpleGrid>
                    </Box>
                  );
                })()}

                <Text fontSize="xs" color="orange.600" bg="orange.50" p={2} borderRadius="md">
                  This goes directly to the principal, not your regular EMI. Confirm only after the bank credits it.
                </Text>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onPrepayClose}>Cancel</Button>
            <Button
              colorScheme="green"
              size="sm"
              isDisabled={!prepayAmount || !prepayDate || parseFloat(prepayAmount) <= 0}
              isLoading={prepayMutation.isPending}
              onClick={() => {
                if (!prepayLoan || !prepayAmount || !prepayDate) return;
                prepayMutation.mutate({
                  loanId: prepayLoan.id,
                  amount: Math.round(parseFloat(prepayAmount) * 100),
                  date: prepayDate,
                  prepayment_type: prepayMode,
                });
              }}
            >
              Confirm Payment
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </PageWrapper>
  );
}

// ─── Debt Strategy Planner ───────────────────────────────────────────────────

interface StrategyProps {
  loans: Loan[];
  onForeclose: (loan: Loan) => void;
}

function DebtStrategyPlanner({ loans, onForeclose }: StrategyProps) {
  const [method, setMethod] = useState<'snowball' | 'avalanche'>('snowball');
  if (loans.length < 1) return null;

  const snowball  = [...loans].sort((a, b) => a.outstanding_balance - b.outstanding_balance);
  const avalanche = [...loans].sort((a, b) => b.interest_rate - a.interest_rate);
  const ordered   = method === 'snowball' ? snowball : avalanche;

  const totalOutstanding = loans.reduce((s, l) => s + l.outstanding_balance, 0);
  const totalEMI         = loans.reduce((s, l) => s + l.emi_amount, 0);

  const focus = ordered[0];

  return (
    <GlassCard mt={2}>
      {/* Header */}
      <HStack justify="space-between" align="flex-start" mb={5}>
        <Box>
          <Heading size="sm" mb={1}>Debt Payoff Plan</Heading>
          <HStack spacing={3}>
            <Badge colorScheme="red" variant="subtle" px={2} py={0.5} borderRadius="full" fontSize="xs">
              {formatINR(totalOutstanding)} total debt
            </Badge>
            <Badge colorScheme="orange" variant="subtle" px={2} py={0.5} borderRadius="full" fontSize="xs">
              {formatINR(totalEMI)} / month
            </Badge>
          </HStack>
        </Box>

        {/* Method toggle */}
        <HStack
          spacing={0}
          border="1px solid"
          borderColor="gray.200"
          borderRadius="lg"
          overflow="hidden"
        >
          <Button
            size="sm"
            variant={method === 'snowball' ? 'solid' : 'ghost'}
            colorScheme={method === 'snowball' ? 'purple' : 'gray'}
            borderRadius={0}
            onClick={() => setMethod('snowball')}
            fontWeight={method === 'snowball' ? 'bold' : 'normal'}
            fontSize="xs"
            px={4}
          >
            ❄️ Snowball
          </Button>
          <Button
            size="sm"
            variant={method === 'avalanche' ? 'solid' : 'ghost'}
            colorScheme={method === 'avalanche' ? 'purple' : 'gray'}
            borderRadius={0}
            onClick={() => setMethod('avalanche')}
            fontWeight={method === 'avalanche' ? 'bold' : 'normal'}
            fontSize="xs"
            px={4}
          >
            🌊 Avalanche
          </Button>
        </HStack>
      </HStack>

      {/* Method caption */}
      <Text fontSize="xs" color="gray.500" mb={4}>
        {method === 'snowball'
          ? '❄️ Clear the smallest balance first — each closed loan adds momentum to the next.'
          : '🌊 Clear the highest interest rate first — mathematically saves the most money.'}
      </Text>

      {/* Steps */}
      <VStack align="stretch" spacing={0}>
        {ordered.map((loan, idx) => {
          const isFirst = idx === 0;
          const isLast  = idx === ordered.length - 1;
          return (
            <Box key={loan.id}>
              {/* Step card */}
              <Box
                borderRadius="xl"
                border="2px solid"
                borderColor={isFirst ? 'purple.400' : 'gray.200'}
                bg={isFirst ? 'purple.50' : 'white'}
                overflow="hidden"
              >
                {/* Coloured top bar for focus loan */}
                {isFirst && (
                  <Box
                    h="3px"
                    bgGradient="linear(to-r, purple.400, blue.400)"
                  />
                )}

                <Box p={4}>
                  <HStack justify="space-between" mb={3}>
                    <HStack spacing={2}>
                      <Box
                        w="24px"
                        h="24px"
                        borderRadius="full"
                        bg={isFirst ? 'purple.500' : 'gray.300'}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        flexShrink={0}
                      >
                        <Text fontSize="10px" fontWeight="bold" color="white">
                          {isFirst ? '🎯' : idx + 1}
                        </Text>
                      </Box>
                      <Box>
                        <HStack spacing={2}>
                          <Text
                            fontWeight={isFirst ? 'bold' : 'semibold'}
                            fontSize="sm"
                            color={isFirst ? 'purple.800' : 'gray.700'}
                          >
                            {loan.bank_name}
                          </Text>
                          <Badge
                            colorScheme="gray"
                            variant="subtle"
                            fontSize="10px"
                            textTransform="capitalize"
                          >
                            {loan.loan_type}
                          </Badge>
                        </HStack>
                        <Text fontSize="10px" color={isFirst ? 'purple.600' : 'gray.400'} fontWeight="medium">
                          {isFirst ? 'ATTACK THIS NOW' : `PAY MINIMUM ONLY · attack after step ${idx}`}
                        </Text>
                      </Box>
                    </HStack>

                    {isFirst && (
                      <Button
                        size="xs"
                        colorScheme="purple"
                        variant="outline"
                        borderRadius="full"
                        onClick={() => onForeclose(focus)}
                        fontSize="xs"
                      >
                        Foreclose
                      </Button>
                    )}
                  </HStack>

                  {/* Stats row */}
                  <SimpleGrid columns={3} spacing={2}>
                    <Box
                      bg={isFirst ? 'white' : 'gray.50'}
                      borderRadius="lg"
                      p={2}
                      textAlign="center"
                    >
                      <Text fontSize="9px" color="gray.400" letterSpacing="wider" textTransform="uppercase">
                        Outstanding
                      </Text>
                      <Text
                        fontSize="sm"
                        fontWeight="bold"
                        color={isFirst ? 'red.500' : 'gray.600'}
                        mt={0.5}
                      >
                        {formatINR(loan.outstanding_balance)}
                      </Text>
                    </Box>
                    <Box
                      bg={isFirst ? 'white' : 'gray.50'}
                      borderRadius="lg"
                      p={2}
                      textAlign="center"
                    >
                      <Text fontSize="9px" color="gray.400" letterSpacing="wider" textTransform="uppercase">
                        Interest
                      </Text>
                      <Text
                        fontSize="sm"
                        fontWeight="bold"
                        color={isFirst ? 'orange.500' : 'gray.600'}
                        mt={0.5}
                      >
                        {loan.interest_rate}% p.a.
                      </Text>
                    </Box>
                    <Box
                      bg={isFirst ? 'white' : 'gray.50'}
                      borderRadius="lg"
                      p={2}
                      textAlign="center"
                    >
                      <Text fontSize="9px" color="gray.400" letterSpacing="wider" textTransform="uppercase">
                        Remaining
                      </Text>
                      <Text
                        fontSize="sm"
                        fontWeight="bold"
                        color={isFirst ? 'purple.600' : 'gray.600'}
                        mt={0.5}
                      >
                        {loan.remaining_tenure} mo
                      </Text>
                    </Box>
                  </SimpleGrid>
                </Box>
              </Box>

              {/* Connector between steps */}
              {!isLast && (
                <HStack spacing={2} px={5} py={2} align="center">
                  <Box w="2px" h="28px" bg="gray.200" flexShrink={0} ml="10px" />
                  <Text fontSize="10px" color="gray.400" fontStyle="italic">
                    when cleared → roll {formatINR(loan.emi_amount)}/mo into step {idx + 2}
                  </Text>
                </HStack>
              )}
            </Box>
          );
        })}
      </VStack>

      {/* Rolling rule strip */}
      <HStack
        mt={4}
        p={3}
        bg="purple.50"
        borderRadius="lg"
        spacing={2}
        align="flex-start"
      >
        <Text fontSize="sm" flexShrink={0}>💡</Text>
        <Text fontSize="xs" color="gray.600">
          <Text as="span" fontWeight="semibold" color="purple.700">The Rolling Rule — </Text>
          each time a loan closes, don't pocket that freed EMI. Stack it on the next loan.
          The snowball grows with every step and clears your debt faster.
        </Text>
      </HStack>
    </GlassCard>
  );
}

// ─── Rate History Timeline ────────────────────────────────────────────────────

function RateHistoryTimeline({ loanId, currentRate, startingRate, outstandingBalance, remainingTenure, onReimport }: {
  loanId: number; currentRate: number; startingRate?: number;
  outstandingBalance: number; remainingTenure: number; onReimport?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: history, isLoading } = useQuery<RateHistory[]>({
    queryKey: ['rate-history', loanId],
    queryFn: () => api.get(`/loans/${loanId}/rate-history`).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });
  const clearMutation = useMutation({
    mutationFn: (originalRate: number) =>
      api.delete(`/loans/${loanId}/rate-history?original_rate=${originalRate}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rate-history', loanId] });
      qc.invalidateQueries({ queryKey: ['loans'] });
    },
    onError: () => toast({ title: 'Failed to clear history', status: 'error', duration: 3000 }),
  });

  const handleClearAndReimport = () => {
    const rateStr = window.prompt(
      'What was the ORIGINAL interest rate when this loan was first taken?\nExample: 8.5',
      String(startingRate ?? currentRate),
    );
    if (rateStr === null) return;
    const originalRate = parseFloat(rateStr);
    if (isNaN(originalRate) || originalRate <= 0) {
      alert('Invalid rate. Enter a number like 8.5');
      return;
    }
    clearMutation.mutate(originalRate, {
      onSuccess: () => {
        toast({ title: 'History cleared — now select your statements', status: 'info', duration: 3000 });
        onReimport?.();
      },
    });
  };

  if (isLoading) return <Box py={1}><Spinner size="xs" color="cyan.400" /></Box>;
  if (!history || history.length === 0) {
    return (
      <Box py={2} px={3} bg="cyan.50" borderRadius="md" mb={3} borderLeft="3px solid" borderColor="cyan.300">
        <Text fontSize="xs" color="cyan.700">
          No rate changes logged yet. Click <strong>Update Rate</strong> or <strong>From Statement</strong> to import rate history.
        </Text>
      </Box>
    );
  }

  // Prefer the loan's stored starting rate; fall back to first history entry's old_rate
  const firstRate = startingRate ?? history[0].old_rate;

  return (
    <Box mb={3} px={3} py={2} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
      <HStack justify="space-between" mb={2}>
        <Text fontSize="10px" color="gray.500" fontWeight="semibold" letterSpacing="wider" textTransform="uppercase">
          Rate History
        </Text>
        <Tooltip label="Clear wrong data and re-import from your bank statements" hasArrow>
          <Button
            size="xs"
            variant="ghost"
            colorScheme="red"
            fontSize="9px"
            h="16px"
            isLoading={clearMutation.isPending}
            onClick={handleClearAndReimport}
          >
            Clear &amp; Re-import
          </Button>
        </Tooltip>
      </HStack>
      <VStack spacing={1} align="stretch">
        <HStack spacing={2}>
          <Box w="6px" h="6px" borderRadius="full" bg="gray.400" mt="1px" flexShrink={0} />
          <Text fontSize="xs" color="gray.600">Started at <strong>{firstRate}%</strong></Text>
        </HStack>
        {history.map((h, idx) => {
          const down = h.new_rate < h.old_rate;

          // Interest saved/extra = rate_diff × outstanding_balance × remaining_tenure
          // (approximation using current balance — actual varies as balance reduces)
          const rateDiff = Math.abs(h.new_rate - h.old_rate) / 100 / 12;
          const interestPaise = Math.round(rateDiff * outstandingBalance * remainingTenure);
          const interestRupees = Math.round(interestPaise / 100);
          const interestLabel = down
            ? `~₹${interestRupees.toLocaleString('en-IN')} interest saved`
            : `~₹${interestRupees.toLocaleString('en-IN')} extra interest`;

          // Only fall back to tenure/EMI impact if explicitly non-zero (manual rate changes)
          let impact = '';
          if (h.tenure_impact && h.tenure_impact !== 0) {
            impact = h.tenure_impact < 0
              ? `${Math.abs(h.tenure_impact)} months shorter`
              : `${h.tenure_impact} months longer`;
          } else if (h.emi_impact && h.emi_impact !== 0) {
            impact = h.emi_impact < 0
              ? `EMI -₹${Math.abs(Math.round(h.emi_impact / 100)).toLocaleString('en-IN')}`
              : `EMI +₹${Math.round(h.emi_impact / 100).toLocaleString('en-IN')}`;
          }

          return (
            <HStack key={idx} spacing={2}>
              <Box w="6px" h="6px" borderRadius="full" bg={down ? 'green.400' : 'orange.400'} mt="1px" flexShrink={0} />
              <HStack spacing={1} flexWrap="wrap">
                <Text fontSize="xs" color={down ? 'green.700' : 'orange.700'} fontWeight="semibold">
                  {down ? '↓' : '↑'} {h.new_rate}%
                </Text>
                <Text fontSize="xs" color="gray.400">
                  {new Date(h.effective_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </Text>
                <Text fontSize="xs" color={down ? 'green.600' : 'orange.600'}>
                  · {impact || interestLabel}
                </Text>
                {h.note ? (
                  <Text fontSize="xs" color="gray.400">({h.note})</Text>
                ) : null}
              </HStack>
            </HStack>
          );
        })}
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg="cyan.500" mt="1px" flexShrink={0} />
          <Text fontSize="xs" color="cyan.700" fontWeight="bold">Now: {currentRate}%</Text>
        </HStack>
      </VStack>
    </Box>
  );
}
