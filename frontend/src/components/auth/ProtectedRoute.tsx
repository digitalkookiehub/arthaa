import { Navigate } from 'react-router-dom';
import { Center, Spinner } from '@chakra-ui/react';
import { useAuth } from '../../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <Center h="100vh">
        <Spinner size="xl" color="purple.500" thickness="3px" />
      </Center>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
