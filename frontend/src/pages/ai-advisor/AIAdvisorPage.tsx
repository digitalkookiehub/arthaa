import {
  Box, VStack, HStack, Heading, Text, Textarea, IconButton, Badge, Spinner,
  SimpleGrid, Divider, Button, Flex, Avatar, useColorModeValue, Wrap, WrapItem,
  useDisclosure, Collapse, Tooltip,
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect, useCallback } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import api from '../../services/api';

// ── types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Recommendation {
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  body: string;
  icon: string;
  data_source: string;
}

// ── constants ─────────────────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  { label: 'How is my savings rate?', q: 'How is my savings rate? Give me specific advice to improve it.' },
  { label: 'Which loan first?', q: 'Which loan should I focus on closing first and why?' },
  { label: 'Tax savings opportunities', q: 'How much can I save in taxes this year? What should I invest in for 80C?' },
  { label: 'Emergency fund status', q: 'Is my emergency fund sufficient? What should I do to improve it?' },
  { label: 'Investment advice', q: 'Looking at my current investments, what changes should I make?' },
  { label: 'Net worth growth', q: 'What can I do to grow my net worth faster?' },
];

const PRIORITY_COLOR: Record<string, string> = {
  high:   'red',
  medium: 'orange',
  low:    'green',
};

const PRIORITY_ORDER = ['high', 'medium', 'low'];

// ── welcome message ───────────────────────────────────────────────────────────

const WELCOME: Message = {
  role:      'assistant',
  content:   "Namaste! I'm your ArthaA financial advisor. I have access to your complete financial picture — income, expenses, loans, investments, and more. Ask me anything about your finances, and I'll give you specific, data-driven advice tailored to your situation.",
  timestamp: new Date(),
};

// ── helpers ───────────────────────────────────────────────────────────────────

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── components ────────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser  = msg.role === 'user';
  const userBg  = useColorModeValue('purple.500', 'purple.400');
  const aiBg    = useColorModeValue('white', 'gray.700');
  const aiBorder = useColorModeValue('gray.200', 'gray.600');

  return (
    <Flex justify={isUser ? 'flex-end' : 'flex-start'} w="100%">
      {!isUser && (
        <Avatar size="xs" name="ArthaA AI" bg="purple.500" color="white" mr={2} mt={1}
          sx={{ '& > div': { fontSize: '8px', fontWeight: 'bold' } }}
          getInitials={() => 'AI'} flexShrink={0} />
      )}
      <Box maxW={{ base: '85%', md: '72%' }}>
        <Box
          bg={isUser ? userBg : aiBg}
          color={isUser ? 'white' : 'inherit'}
          border={isUser ? 'none' : '1px solid'}
          borderColor={isUser ? undefined : aiBorder}
          px={4} py={3}
          borderRadius={isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px'}
          boxShadow="sm"
          fontSize="sm"
          lineHeight="1.6"
          whiteSpace="pre-wrap"
        >
          {msg.content}
        </Box>
        <Text fontSize="10px" color="gray.400" mt={1} textAlign={isUser ? 'right' : 'left'} px={1}>
          {formatTime(msg.timestamp)}
        </Text>
      </Box>
      {isUser && (
        <Avatar size="xs" name="You" bg="gray.400" ml={2} mt={1} flexShrink={0} />
      )}
    </Flex>
  );
}

function TypingIndicator() {
  const bg = useColorModeValue('white', 'gray.700');
  return (
    <Flex justify="flex-start" w="100%">
      <Avatar size="xs" name="AI" bg="purple.500" color="white" mr={2} mt={1}
        getInitials={() => 'AI'} />
      <Box bg={bg} border="1px solid" borderColor="gray.200" px={4} py={3}
        borderRadius="18px 18px 18px 4px" boxShadow="sm">
        <HStack spacing={1}>
          {[0, 1, 2].map(i => (
            <Box key={i} w="6px" h="6px" bg="purple.400" borderRadius="full"
              sx={{ animation: `bounce 1.2s ${i * 0.2}s infinite`, '@keyframes bounce': {
                '0%,100%': { transform: 'translateY(0)' },
                '50%':     { transform: 'translateY(-6px)' },
              }}} />
          ))}
        </HStack>
      </Box>
    </Flex>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: rec.priority === 'high' });
  const bg  = useColorModeValue('white', 'gray.700');
  const pct = { high: 100, medium: 65, low: 30 }[rec.priority];

  return (
    <GlassCard p={0} overflow="hidden" borderLeft="4px solid"
      borderLeftColor={`${PRIORITY_COLOR[rec.priority]}.400`}>
      <Box
        px={4} py={3} cursor="pointer" onClick={onToggle}
        _hover={{ bg: useColorModeValue('gray.50', 'gray.650') }}
        transition="background 0.15s"
      >
        <HStack justify="space-between">
          <HStack spacing={3}>
            <Text fontSize="xl" lineHeight="1">{rec.icon}</Text>
            <Box>
              <Text fontSize="sm" fontWeight="semibold">{rec.title}</Text>
              <Badge colorScheme={PRIORITY_COLOR[rec.priority]} fontSize="9px" variant="subtle">
                {rec.priority.toUpperCase()} PRIORITY
              </Badge>
            </Box>
          </HStack>
          <Text fontSize="xs" color="gray.400">{isOpen ? '▲' : '▼'}</Text>
        </HStack>
      </Box>
      <Collapse in={isOpen}>
        <Box px={4} pb={4}>
          <Text fontSize="sm" color="gray.600" _dark={{ color: 'gray.300' }} lineHeight="1.7">
            {rec.body}
          </Text>
          <Text fontSize="10px" color="gray.400" mt={2}>Source: {rec.data_source}</Text>
        </Box>
      </Collapse>
    </GlassCard>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AIAdvisorPage() {
  const [messages,   setMessages]   = useState<Message[]>([WELCOME]);
  const [input,      setInput]      = useState('');
  const [streaming,  setStreaming]  = useState(false);
  const [streamText, setStreamText] = useState('');
  const bottomRef   = useRef<HTMLDivElement>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const qc          = useQueryClient();

  const recQuery = useQuery<{ recommendations: Recommendation[] }>({
    queryKey: ['ai-recommendations'],
    queryFn:  () => api.get('/ai/recommendations').then(r => r.data),
    staleTime: 1000 * 60 * 30,
  });

  const refreshMut = useMutation({
    mutationFn: () => api.post('/ai/recommendations/refresh').then(r => r.data),
    onSuccess: d => qc.setQueryData(['ai-recommendations'], d),
  });

  // scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText, streaming]);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || streaming) return;

    setInput('');
    const newHistory = [...messages, { role: 'user' as const, content: userMsg, timestamp: new Date() }];
    setMessages(newHistory);
    setStreaming(true);
    setStreamText('');

    const controller = new AbortController();
    abortRef.current = controller;

    // Prepare history for API (exclude welcome message)
    const apiHistory = messages
      .filter(m => m !== WELCOME)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
      const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/ai/chat/stream`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:   JSON.stringify({ message: userMsg, history: apiHistory }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) throw new Error('Stream failed');

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   full    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const { text } = JSON.parse(data) as { text: string };
            full += text;
            setStreamText(full);
          } catch { /* partial JSON line — ignore */ }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: full, timestamp: new Date() }]);
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Sorry, I could not reach the AI service. Make sure Ollama is running (`ollama serve`).', timestamp: new Date() },
        ]);
      }
    } finally {
      setStreaming(false);
      setStreamText('');
      abortRef.current = null;
    }
  }, [messages, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stopStream = () => {
    abortRef.current?.abort();
  };

  const recs = recQuery.data?.recommendations ?? [];
  const sortedRecs = [...recs].sort((a, b) =>
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );
  const highCount = recs.filter(r => r.priority === 'high').length;

  const chatBg = useColorModeValue('gray.50', 'gray.800');

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6} h="100%">

        {/* ── Header ── */}
        <HStack justify="space-between">
          <Box>
            <HStack spacing={2}>
              <Heading size="lg">AI Financial Advisor</Heading>
              <Badge colorScheme="purple" fontSize="10px" variant="solid">BETA</Badge>
            </HStack>
            <Text color="gray.500" fontSize="sm">Powered by {import.meta.env.VITE_OLLAMA_MODEL || 'deepseek-r1:7b'} via Ollama</Text>
          </Box>
          <HStack>
            {highCount > 0 && (
              <Badge colorScheme="red" variant="solid" fontSize="xs">
                {highCount} urgent insight{highCount > 1 ? 's' : ''}
              </Badge>
            )}
          </HStack>
        </HStack>

        {/* ── Two-column layout ── */}
        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5} flex="1">

          {/* ══ LEFT: Chat ══════════════════════════════════════════════════ */}
          <GlassCard p={0} display="flex" flexDir="column" minH="70vh" overflow="hidden">

            {/* Messages */}
            <Box flex="1" overflowY="auto" p={4} bg={chatBg} display="flex" flexDir="column" gap={4}>
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}

              {/* Streaming preview */}
              {streaming && (
                <>
                  {streamText ? (
                    <MessageBubble msg={{ role: 'assistant', content: streamText + '▌', timestamp: new Date() }} />
                  ) : (
                    <TypingIndicator />
                  )}
                </>
              )}
              <div ref={bottomRef} />
            </Box>

            {/* Quick question chips */}
            {messages.length <= 1 && (
              <Box px={4} py={2} borderTop="1px solid" borderColor="gray.100" _dark={{ borderColor: 'gray.600' }}>
                <Text fontSize="xs" color="gray.400" mb={2}>Suggested questions:</Text>
                <Wrap spacing={2}>
                  {QUICK_QUESTIONS.map(qq => (
                    <WrapItem key={qq.label}>
                      <Button
                        size="xs" variant="outline" colorScheme="purple"
                        borderRadius="full" fontSize="11px"
                        onClick={() => sendMessage(qq.q)}
                        isDisabled={streaming}
                      >
                        {qq.label}
                      </Button>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            )}

            {/* Input */}
            <Box px={4} py={3} borderTop="1px solid" borderColor="gray.100" _dark={{ borderColor: 'gray.600' }}>
              <HStack spacing={2} align="flex-end">
                <Textarea
                  placeholder="Ask anything about your finances… (Enter to send, Shift+Enter for newline)"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  resize="none"
                  fontSize="sm"
                  borderRadius="xl"
                  isDisabled={streaming}
                  focusBorderColor="purple.400"
                />
                {streaming ? (
                  <Tooltip label="Stop">
                    <IconButton
                      aria-label="Stop"
                      icon={<Text fontSize="lg">⏹️</Text>}
                      colorScheme="red"
                      borderRadius="xl"
                      onClick={stopStream}
                      size="md"
                    />
                  </Tooltip>
                ) : (
                  <Tooltip label="Send (Enter)">
                    <IconButton
                      aria-label="Send"
                      icon={<Text fontSize="lg">➤</Text>}
                      colorScheme="purple"
                      borderRadius="xl"
                      onClick={() => sendMessage(input)}
                      isDisabled={!input.trim()}
                      size="md"
                    />
                  </Tooltip>
                )}
              </HStack>
              <Text fontSize="10px" color="gray.400" mt={1}>
                AI uses your real financial data — no guesses. For best results, run Ollama locally.
              </Text>
            </Box>
          </GlassCard>

          {/* ══ RIGHT: Insights ═════════════════════════════════════════════ */}
          <VStack align="stretch" spacing={4}>
            <GlassCard p={4}>
              <HStack justify="space-between">
                <Box>
                  <Heading size="sm">Smart Insights</Heading>
                  <Text fontSize="xs" color="gray.500">Based on your live financial data</Text>
                </Box>
                <Tooltip label="Regenerate insights">
                  <IconButton
                    aria-label="Refresh insights"
                    icon={<Text>🔄</Text>}
                    size="sm"
                    variant="ghost"
                    isLoading={refreshMut.isPending}
                    onClick={() => refreshMut.mutate()}
                  />
                </Tooltip>
              </HStack>

              {/* Priority summary row */}
              {recs.length > 0 && (
                <HStack mt={3} spacing={3}>
                  {(['high','medium','low'] as const).map(p => {
                    const cnt = recs.filter(r => r.priority === p).length;
                    if (!cnt) return null;
                    return (
                      <HStack key={p} spacing={1}>
                        <Badge colorScheme={PRIORITY_COLOR[p]} fontSize="9px">{cnt}</Badge>
                        <Text fontSize="10px" color="gray.500" textTransform="capitalize">{p}</Text>
                      </HStack>
                    );
                  })}
                </HStack>
              )}
            </GlassCard>

            {recQuery.isLoading ? (
              <Box textAlign="center" py={8}><Spinner color="purple.500" /></Box>
            ) : (
              <VStack align="stretch" spacing={3} overflowY="auto" maxH="60vh"
                css={{ '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { background: '#CBD5E0', borderRadius: '4px' } }}>
                {sortedRecs.map((rec, i) => (
                  <RecommendationCard key={i} rec={rec} />
                ))}
                {!sortedRecs.length && (
                  <GlassCard>
                    <Text textAlign="center" color="gray.400" py={4} fontSize="sm">
                      No insights yet — add some financial data to get started.
                    </Text>
                  </GlassCard>
                )}
              </VStack>
            )}

            {/* Quick action: ask about insight */}
            {sortedRecs.length > 0 && (
              <GlassCard p={4}>
                <Text fontSize="xs" color="gray.500" mb={2} fontWeight="semibold">Ask about an insight</Text>
                <Wrap spacing={2}>
                  {sortedRecs.slice(0, 3).map((r, i) => (
                    <WrapItem key={i}>
                      <Button
                        size="xs" variant="ghost" colorScheme="purple" fontSize="11px"
                        onClick={() => sendMessage(`Tell me more about: "${r.title}"`)}
                        maxW="180px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap"
                      >
                        {r.icon} {r.title.slice(0, 28)}{r.title.length > 28 ? '…' : ''}
                      </Button>
                    </WrapItem>
                  ))}
                </Wrap>
              </GlassCard>
            )}
          </VStack>
        </SimpleGrid>
      </VStack>
    </PageWrapper>
  );
}
