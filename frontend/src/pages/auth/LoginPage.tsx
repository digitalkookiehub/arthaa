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
import { useAuth } from '../../context/AuthContext';
import { GradientButton } from '../../components/ui/GradientButton';
import { MeshBackground } from '../../components/layout/MeshBackground';
import { GlassCard } from '../../components/ui/GlassCard';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password. Please try again.');
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
          <Heading
            size="xl"
            bgGradient="linear(to-r, purple.500, pink.500)"
            bgClip="text"
          >
            ArthaA
          </Heading>
          <Text color="gray.500" fontSize="sm">Your personal finance companion</Text>
        </VStack>

        <GlassCard noHover>
          <VStack spacing={5} as="form" onSubmit={handleSubmit}>
            <Heading size="md">Sign In</Heading>
            {error && (
              <Alert status="error" borderRadius="lg" fontSize="sm">
                <AlertIcon />
                {error}
              </Alert>
            )}
            <FormControl isRequired>
              <FormLabel fontSize="sm">Email</FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                focusBorderColor="purple.400"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Password</FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                focusBorderColor="purple.400"
              />
            </FormControl>
            <GradientButton type="submit" w="full" isLoading={isLoading} size="md">
              Sign In
            </GradientButton>
            <Text fontSize="sm" color="gray.500" textAlign="center">
              Don't have an account?{' '}
              <Link as={RouterLink} to="/register" color="purple.500" fontWeight="semibold">
                Register
              </Link>
            </Text>
          </VStack>
        </GlassCard>
      </Box>
    </Box>
  );
}
