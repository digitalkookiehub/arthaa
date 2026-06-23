import { Text, TextProps } from '@chakra-ui/react';
import { formatINR } from '../../lib/utils';

interface INRAmountProps extends TextProps {
  paise: number;
  showPaise?: boolean;
  colored?: boolean;
}

export function INRAmount({ paise, showPaise = false, colored = false, ...props }: INRAmountProps) {
  const color = colored ? (paise >= 0 ? 'green.500' : 'red.500') : undefined;
  return (
    <Text color={color} {...props}>
      {formatINR(paise, showPaise)}
    </Text>
  );
}
