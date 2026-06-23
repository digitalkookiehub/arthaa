import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  VStack,
  Heading,
  Text,
  Input,
  FormControl,
  FormLabel,
  Alert,
  AlertIcon,
  Link,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import api from '../../services/api';
import { GradientButton } from '../../components/ui/GradientButton';
import { MeshBackground } from '../../components/layout/MeshBackground';
import { GlassCard } from '../../components/ui/GlassCard';

interface RegisterForm {
  email: string;
  password: string;
  full_name: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterForm>({ email: '', password: '', full_name: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const update = (field: keyof RegisterForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await api.post('/auth/register', form);
      navigate('/login?registered=1');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" px={4}>
      <MeshBackground />
      <Box
        as={motion.div}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        w="full"
        maxW="400px"
      >
        <VStack spacing={1} mb={8} textAlign="center">
          <Heading size="xl" bgGradient="linear(to-r, purple.500, pink.500)" bgClip="text">
            ArthaA
          </Heading>
          <Text color="gray.500" fontSize="sm">Start your financial journey</Text>
        </VStack>

        <GlassCard noHover>
          <VStack spacing={5} as="form" onSubmit={handleSubmit}>
            <Heading size="md">Create Account</Heading>
            {error && (
              <Alert status="error" borderRadius="lg" fontSize="sm">
                <AlertIcon />
                {error}
              </Alert>
            )}
            <FormControl isRequired>
              <FormLabel fontSize="sm">Full Name</FormLabel>
              <Input
                value={form.full_name}
                onChange={update('full_name')}
                placeholder="Raj Kumar"
                focusBorderColor="purple.400"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Email</FormLabel>
              <Input
                type="email"
                value={form.email}
                onChange={update('email')}
                placeholder="raj@example.com"
                focusBorderColor="purple.400"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Password</FormLabel>
              <Input
                type="password"
                value={form.password}
                onChange={update('password')}
                placeholder="Min 8 characters"
                focusBorderColor="purple.400"
              />
            </FormControl>
            <GradientButton type="submit" w="full" isLoading={isLoading} size="md">
              Create Account
            </GradientButton>
            <Text fontSize="sm" color="gray.500" textAlign="center">
              Already have an account?{' '}
              <Link as={RouterLink} to="/login" color="purple.500" fontWeight="semibold">
                Sign In
              </Link>
            </Text>
          </VStack>
        </GlassCard>
      </Box>
    </Box>
  );
}
