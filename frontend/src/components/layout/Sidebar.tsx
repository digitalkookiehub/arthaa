import { Box, VStack, Text, Divider } from '@chakra-ui/react';
import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: '📊' },
  { label: 'Expenses', path: '/expenses', icon: '💸' },
  { label: 'Income', path: '/income', icon: '💰' },
  { label: 'Budgets', path: '/budgets', icon: '📋' },
  { label: 'Loans', path: '/loans', icon: '🏦' },
  { label: 'Investments', path: '/investments', icon: '📈' },
  { label: 'Assets', path: '/assets', icon: '🏠' },
  { label: 'Goals', path: '/goals', icon: '🎯' },
  { label: 'Net Worth', path: '/net-worth', icon: '💎' },
  { label: 'Credit Cards', path: '/credit-cards', icon: '💳' },
  { label: 'Health Score', path: '/health-score', icon: '❤️' },
  { label: 'AI Advisor', path: '/ai-advisor', icon: '🤖' },
  { label: 'Documents', path: '/documents', icon: '📄' },
  { label: 'Reports', path: '/reports', icon: '📑' },
  { label: 'Calendar', path: '/calendar', icon: '📅' },
  { label: 'Tax', path: '/tax', icon: '🧾' },
  { label: 'Insurance', path: '/insurance', icon: '🛡️' },
  { label: 'Subscriptions', path: '/subscriptions', icon: '🔄' },
];

export function Sidebar() {
  const location = useLocation();
  return (
    <Box
      as="nav"
      w="240px"
      h="100vh"
      position="fixed"
      left={0}
      top={0}
      bg="white"
      borderRight="1px solid"
      borderColor="gray.100"
      overflowY="auto"
      _dark={{ bg: 'gray.800', borderColor: 'gray.700' }}
      display={{ base: 'none', md: 'block' }}
      zIndex={10}
    >
      <Box p={6} pb={4}>
        <Text
          fontSize="xl"
          fontWeight="bold"
          bgGradient="linear(to-r, purple.500, pink.500)"
          bgClip="text"
        >
          ArthaA
        </Text>
        <Text fontSize="xs" color="gray.400">Personal Finance</Text>
      </Box>
      <Divider />
      <VStack spacing={0.5} p={3} align="stretch">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Box
              key={item.path}
              as={Link}
              to={item.path}
              display="flex"
              alignItems="center"
              gap={3}
              px={3}
              py={2}
              borderRadius="lg"
              fontSize="sm"
              fontWeight={isActive ? 'semibold' : 'normal'}
              bg={isActive ? 'purple.50' : 'transparent'}
              color={isActive ? 'purple.600' : 'gray.600'}
              _hover={{ bg: 'purple.50', color: 'purple.600' }}
              _dark={{
                color: isActive ? 'purple.300' : 'gray.400',
                bg: isActive ? 'purple.900' : 'transparent',
                _hover: { bg: 'purple.900', color: 'purple.300' },
              }}
              transition="all 0.15s"
            >
              <Text fontSize="md">{item.icon}</Text>
              <Text>{item.label}</Text>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}
