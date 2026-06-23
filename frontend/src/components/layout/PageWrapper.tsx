import { motion } from 'framer-motion';
import { Box } from '@chakra-ui/react';
import { ReactNode } from 'react';

export function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <Box
      as={motion.div}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.25 } as object}
      minH="100vh"
    >
      {children}
    </Box>
  );
}
