import {
  Flex,
  Text,
  IconButton,
  useColorMode,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
} from '@chakra-ui/react';
import { useAuth } from '../../context/AuthContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const { toggleColorMode, colorMode } = useColorMode();

  return (
    <Flex
      as="header"
      h="60px"
      px={6}
      align="center"
      justify="flex-end"
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.100"
      _dark={{ bg: 'gray.800', borderColor: 'gray.700' }}
      gap={3}
      position="sticky"
      top={0}
      zIndex={9}
    >
      <IconButton
        aria-label="Toggle dark mode"
        icon={<Text>{colorMode === 'light' ? '🌙' : '☀️'}</Text>}
        variant="ghost"
        onClick={toggleColorMode}
        size="sm"
      />
      <Menu>
        <MenuButton>
          <Avatar
            size="sm"
            name={user?.full_name ?? user?.email}
            bgGradient="linear(to-r, purple.400, pink.400)"
          />
        </MenuButton>
        <MenuList>
          <MenuItem fontSize="sm" color="gray.500" isDisabled>
            {user?.email}
          </MenuItem>
          <MenuDivider />
          <MenuItem as="a" href="/profile">Profile</MenuItem>
          <MenuItem as="a" href="/settings">Settings</MenuItem>
          <MenuDivider />
          <MenuItem onClick={logout} color="red.500">Sign Out</MenuItem>
        </MenuList>
      </Menu>
    </Flex>
  );
}
