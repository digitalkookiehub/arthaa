import { motion, MotionProps } from 'framer-motion';
import { Box, BoxProps } from '@chakra-ui/react';
import { ReactNode } from 'react';

interface GlassCardProps extends BoxProps {
  children: ReactNode;
  motionProps?: MotionProps;
  noHover?: boolean;
}

export function GlassCard({ children, motionProps, noHover, ...boxProps }: GlassCardProps) {
  return (
    <Box
      as={motion.div}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={noHover ? undefined : { scale: 1.01, y: -2 }}
      transition={{ duration: 0.3 } as object}
      bg="white"
      borderRadius="2xl"
      boxShadow="sm"
      border="1px solid"
      borderColor="gray.100"
      p={6}
      _dark={{ bg: 'gray.800', borderColor: 'gray.700' }}
      {...(motionProps as object)}
      {...boxProps}
    >
      {children}
    </Box>
  );
}
