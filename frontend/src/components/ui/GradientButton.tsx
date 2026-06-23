import { motion } from 'framer-motion';
import { Button, ButtonProps } from '@chakra-ui/react';
import { forwardRef } from 'react';

export const GradientButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, ...props }, ref) => (
    <Button
      ref={ref}
      as={motion.button}
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97 }}
      bgGradient="linear(to-r, purple.500, pink.500)"
      color="white"
      borderRadius="full"
      fontWeight="semibold"
      _hover={{ bgGradient: 'linear(to-r, purple.600, pink.600)', shadow: 'lg' }}
      {...props}
    >
      {children}
    </Button>
  ),
);
GradientButton.displayName = 'GradientButton';
