import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { VStack } from '@chakra-ui/react';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export function AnimatedList({ children }: { children: ReactNode[] }) {
  return (
    <VStack
      as={motion.div}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      spacing={3}
      align="stretch"
    >
      {children.map((child, i) => (
        <motion.div key={i} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </VStack>
  );
}
