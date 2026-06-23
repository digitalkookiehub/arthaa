import { Box, Flex } from '@chakra-ui/react';
import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <Flex minH="100vh" bg="gray.50" _dark={{ bg: 'gray.900' }}>
      <Sidebar />
      <Flex direction="column" flex={1} ml={{ base: 0, md: '240px' }}>
        <Navbar />
        <Box as="main" p={6} flex={1}>
          {children}
        </Box>
      </Flex>
    </Flex>
  );
}
