import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Center, Spinner } from '@chakra-ui/react';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';

// Auth pages
const LoginPage    = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));

// Module pages
const DashboardPage   = lazy(() => import('./pages/dashboard/DashboardPage'));
const ExpensesPage    = lazy(() => import('./pages/expenses/ExpensesPage'));
const IncomePage      = lazy(() => import('./pages/income/IncomePage'));
const BudgetsPage     = lazy(() => import('./pages/budgets/BudgetsPage'));
const LoansPage       = lazy(() => import('./pages/loans/LoansPage'));
const InvestmentsPage = lazy(() => import('./pages/investments/InvestmentsPage'));
const NetWorthPage    = lazy(() => import('./pages/net-worth/NetWorthPage'));
const AssetsPage      = lazy(() => import('./pages/assets/AssetsPage'));
const GoalsPage        = lazy(() => import('./pages/goals/GoalsPage'));
const CreditCardsPage  = lazy(() => import('./pages/credit-cards/CreditCardsPage'));
const HealthScorePage      = lazy(() => import('./pages/health-score/HealthScorePage'));
const SubscriptionsPage    = lazy(() => import('./pages/subscriptions/SubscriptionsPage'));
const InsurancePage        = lazy(() => import('./pages/insurance/InsurancePage'));
const ReportsPage          = lazy(() => import('./pages/reports/ReportsPage'));
const AIAdvisorPage        = lazy(() => import('./pages/ai-advisor/AIAdvisorPage'));
const CalendarPage         = lazy(() => import('./pages/calendar/CalendarPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

const PageLoader = () => (
  <Center h="100vh">
    <Spinner size="xl" color="purple.500" thickness="3px" />
  </Center>
);

function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <MainLayout>{children}</MainLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public */}
                <Route path="/login"    element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/"         element={<Navigate to="/dashboard" replace />} />

                {/* Protected module pages */}
                <Route path="/dashboard"   element={<ProtectedPage><DashboardPage /></ProtectedPage>} />
                <Route path="/expenses"    element={<ProtectedPage><ExpensesPage /></ProtectedPage>} />
                <Route path="/income"      element={<ProtectedPage><IncomePage /></ProtectedPage>} />
                <Route path="/budgets"     element={<ProtectedPage><BudgetsPage /></ProtectedPage>} />
                <Route path="/loans"       element={<ProtectedPage><LoansPage /></ProtectedPage>} />
                <Route path="/investments" element={<ProtectedPage><InvestmentsPage /></ProtectedPage>} />
                <Route path="/net-worth"   element={<ProtectedPage><NetWorthPage /></ProtectedPage>} />
                <Route path="/assets"      element={<ProtectedPage><AssetsPage /></ProtectedPage>} />
                <Route path="/goals"        element={<ProtectedPage><GoalsPage /></ProtectedPage>} />
                <Route path="/credit-cards" element={<ProtectedPage><CreditCardsPage /></ProtectedPage>} />
                <Route path="/health-score"   element={<ProtectedPage><HealthScorePage /></ProtectedPage>} />
                <Route path="/subscriptions" element={<ProtectedPage><SubscriptionsPage /></ProtectedPage>} />
                <Route path="/insurance"    element={<ProtectedPage><InsurancePage /></ProtectedPage>} />
                <Route path="/reports"     element={<ProtectedPage><ReportsPage /></ProtectedPage>} />
                <Route path="/ai-advisor" element={<ProtectedPage><AIAdvisorPage /></ProtectedPage>} />
                <Route path="/calendar"  element={<ProtectedPage><CalendarPage /></ProtectedPage>} />

                {/* Catch-all redirect */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ChakraProvider>
    </QueryClientProvider>
  );
}
