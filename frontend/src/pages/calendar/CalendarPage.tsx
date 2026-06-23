import {
  Box, VStack, HStack, Heading, Text, Badge, Button, SimpleGrid,
  Spinner, Flex, Divider, Tabs, TabList, Tab, TabPanels, TabPanel,
  useColorModeValue, Tooltip,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { formatINR } from '../../lib/utils';
import api from '../../services/api';

// ── types ─────────────────────────────────────────────────────────────────────

interface CalEvent {
  date:       string;
  type:       string;
  label:      string;
  icon:       string;
  color:      string;
  title:      string;
  subtitle:   string;
  amount:     number;
  amount_str: string;
  entity_id:  number | null;
  is_overdue: boolean;
  days_away:  number;
  urgency:    'overdue' | 'critical' | 'urgent' | 'soon' | 'upcoming';
}

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

const URGENCY_COLOR: Record<string, string> = {
  overdue:  'red',
  critical: 'red',
  urgent:   'orange',
  soon:     'yellow',
  upcoming: 'gray',
};

const URGENCY_LABEL: Record<string, string> = {
  overdue:  'Overdue',
  critical: 'Today / Tomorrow',
  urgent:   'This Week',
  soon:     'Next 2 Weeks',
  upcoming: 'Upcoming',
};

function dayLabel(days: number): string {
  if (days < 0)  return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function isoToDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ── calendar grid helpers ─────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

// ── components ────────────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: CalEvent }) {
  const bg = useColorModeValue('white', 'gray.700');
  return (
    <Flex
      align="center" gap={3} p={3} borderRadius="lg" bg={bg}
      boxShadow="sm" border="1px solid" borderColor={useColorModeValue('gray.100','gray.600')}
      borderLeft="3px solid" borderLeftColor={ev.color}
    >
      <Text fontSize="xl" minW="28px">{ev.icon}</Text>
      <Box flex="1" minW={0}>
        <HStack spacing={2} flexWrap="wrap">
          <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{ev.title}</Text>
          <Badge colorScheme={URGENCY_COLOR[ev.urgency]} fontSize="9px" variant="subtle">
            {dayLabel(ev.days_away)}
          </Badge>
          {ev.is_overdue && <Badge colorScheme="red" fontSize="9px">OVERDUE</Badge>}
        </HStack>
        {ev.subtitle && <Text fontSize="xs" color="gray.500" noOfLines={1}>{ev.subtitle}</Text>}
        <Text fontSize="10px" color="gray.400">{isoToDate(ev.date).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })}</Text>
      </Box>
      {ev.amount > 0 && (
        <Text fontSize="sm" fontWeight="bold" color={ev.is_overdue ? 'red.500' : 'gray.700'} _dark={{ color: ev.is_overdue ? 'red.300' : 'gray.200' }} whiteSpace="nowrap">
          {ev.amount_str}
        </Text>
      )}
    </Flex>
  );
}

// ── Mini calendar cell ────────────────────────────────────────────────────────

function CalCell({ day, events, isToday, isOtherMonth, onSelect, isSelected }: {
  day: number;
  events: CalEvent[];
  isToday: boolean;
  isOtherMonth: boolean;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const bg     = useColorModeValue('white','gray.700');
  const todayC = 'purple.500';
  const selBg  = useColorModeValue('purple.50','purple.900');
  const dots   = events.slice(0, 3);

  return (
    <Box
      minH="64px" p={1} borderRadius="md" cursor="pointer"
      bg={isSelected ? selBg : isToday ? 'purple.50' : bg}
      _dark={{ bg: isSelected ? 'purple.900' : isToday ? 'purple.900' : 'gray.700' }}
      border="1px solid" borderColor={isSelected ? 'purple.300' : 'transparent'}
      onClick={onSelect} _hover={{ borderColor: 'purple.200' }} transition="all 0.1s"
      opacity={isOtherMonth ? 0.3 : 1}
    >
      <Text
        fontSize="xs" fontWeight={isToday ? 'bold' : 'normal'}
        color={isToday ? todayC : 'inherit'}
        textAlign="center"
      >
        {day}
      </Text>
      <VStack spacing={0.5} mt={0.5}>
        {dots.map((ev, i) => (
          <Tooltip key={i} label={ev.title} placement="top" hasArrow>
            <Box
              w="100%" h="3px" borderRadius="full"
              bg={ev.color} opacity={ev.is_overdue ? 1 : 0.7}
            />
          </Tooltip>
        ))}
        {events.length > 3 && (
          <Text fontSize="9px" color="gray.400">+{events.length - 3}</Text>
        )}
      </VStack>
    </Box>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selDate,   setSelDate]   = useState<string | null>(today.toISOString().slice(0, 10));

  // fetch a 3-month window centered on view month
  const fromDate = useMemo(() => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    return d.toISOString().slice(0, 10);
  }, [viewYear, viewMonth]);

  const toDate = useMemo(() => {
    const d = new Date(viewYear, viewMonth + 2, 0); // last day of viewMonth+1
    return d.toISOString().slice(0, 10);
  }, [viewYear, viewMonth]);

  const eventsQuery = useQuery<{ events: CalEvent[] }>({
    queryKey: ['calendar-events', fromDate, toDate],
    queryFn:  () => api.get('/calendar/events', { params: { from_date: fromDate, to_date: toDate } }).then(r => r.data),
  });

  const upcomingQuery = useQuery<{ events: CalEvent[] }>({
    queryKey: ['calendar-upcoming'],
    queryFn:  () => api.get('/calendar/upcoming', { params: { days: 30 } }).then(r => r.data),
    staleTime: 1000 * 60 * 10,
  });

  const allEvents = eventsQuery.data?.events ?? [];

  // group events by ISO date string
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of allEvents) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [allEvents]);

  const selectedEvents = selDate ? (eventsByDate[selDate] ?? []) : [];
  const upcoming       = upcomingQuery.data?.events ?? [];

  // Calendar grid
  const totalDays = daysInMonth(viewYear, viewMonth);
  const startDay  = firstDayOfMonth(viewYear, viewMonth);  // 0=Sun

  function navMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setViewMonth(m);
    setViewYear(y);
  }

  function dateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const todayStr = today.toISOString().slice(0, 10);

  // Urgency summary
  const urgencyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of upcoming) {
      counts[ev.urgency] = (counts[ev.urgency] ?? 0) + 1;
    }
    return counts;
  }, [upcoming]);

  const totalUpcomingAmount = useMemo(
    () => upcoming.reduce((s, e) => s + e.amount, 0),
    [upcoming]
  );

  const gridRows: Array<Array<{ day: number; month: number; year: number }>> = [];
  let cells: Array<{ day: number; month: number; year: number }> = [];

  // Previous month padding
  const prevMonthDays = daysInMonth(
    viewMonth === 0 ? viewYear - 1 : viewYear,
    viewMonth === 0 ? 11 : viewMonth - 1
  );
  for (let i = startDay - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, month: viewMonth === 0 ? 11 : viewMonth - 1, year: viewMonth === 0 ? viewYear - 1 : viewYear });
  }
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, month: viewMonth, year: viewYear });
    if (cells.length === 7) { gridRows.push(cells); cells = []; }
  }
  // Fill remainder
  let nextDay = 1;
  while (cells.length > 0 && cells.length < 7) {
    cells.push({ day: nextDay++, month: (viewMonth + 1) % 12, year: viewMonth === 11 ? viewYear + 1 : viewYear });
  }
  if (cells.length) gridRows.push(cells);

  return (
    <PageWrapper>
      <VStack align="stretch" spacing={6}>

        {/* ── Header ── */}
        <HStack justify="space-between">
          <Box>
            <Heading size="lg">Financial Calendar</Heading>
            <Text color="gray.500" fontSize="sm">All upcoming dues, EMIs, renewals, and milestones</Text>
          </Box>
          {(urgencyCounts['overdue'] || urgencyCounts['critical']) && (
            <Badge colorScheme="red" variant="solid" fontSize="xs" px={3} py={1}>
              {(urgencyCounts['overdue'] ?? 0) + (urgencyCounts['critical'] ?? 0)} urgent action{((urgencyCounts['overdue'] ?? 0) + (urgencyCounts['critical'] ?? 0)) > 1 ? 's' : ''}
            </Badge>
          )}
        </HStack>

        {/* ── Urgency summary row ── */}
        {upcoming.length > 0 && (
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            {[
              { k: 'overdue',  label: 'Overdue',    color: 'red'    },
              { k: 'critical', label: 'Due ≤3 days', color: 'red'    },
              { k: 'urgent',   label: 'This week',  color: 'orange' },
              { k: 'soon',     label: 'Next 2 wks', color: 'yellow' },
            ].map(u => (
              <GlassCard key={u.k} p={4}>
                <Text fontSize="xs" color="gray.500">{u.label}</Text>
                <Text fontSize="2xl" fontWeight="black" color={urgencyCounts[u.k] ? `${u.color}.500` : 'gray.300'}>
                  {urgencyCounts[u.k] ?? 0}
                </Text>
              </GlassCard>
            ))}
          </SimpleGrid>
        )}

        <Tabs colorScheme="purple" variant="enclosed">
          <TabList>
            <Tab fontSize="sm">📅 Month View</Tab>
            <Tab fontSize="sm">📋 Upcoming</Tab>
          </TabList>

          <TabPanels>

            {/* ══ MONTH VIEW ══════════════════════════════════════════════════ */}
            <TabPanel px={0} pt={4}>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={5}>

                {/* Calendar grid */}
                <GlassCard p={4}>
                  {/* Nav */}
                  <HStack justify="space-between" mb={4}>
                    <Button size="sm" variant="ghost" onClick={() => navMonth(-1)}>‹</Button>
                    <Heading size="sm">{MONTH_NAMES[viewMonth]} {viewYear}</Heading>
                    <Button size="sm" variant="ghost" onClick={() => navMonth(1)}>›</Button>
                  </HStack>

                  {/* Day headers */}
                  <SimpleGrid columns={7} mb={1}>
                    {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                      <Text key={d} fontSize="10px" textAlign="center" color="gray.400" fontWeight="semibold">{d}</Text>
                    ))}
                  </SimpleGrid>

                  {/* Rows */}
                  {eventsQuery.isLoading ? (
                    <Box textAlign="center" py={8}><Spinner color="purple.500" /></Box>
                  ) : (
                    <VStack spacing={0.5}>
                      {gridRows.map((row, ri) => (
                        <SimpleGrid key={ri} columns={7} spacing={0.5} w="100%">
                          {row.map((cell, ci) => {
                            const key  = dateKey(cell.year, cell.month, cell.day);
                            const evs  = eventsByDate[key] ?? [];
                            const isOther = cell.month !== viewMonth;
                            return (
                              <CalCell
                                key={ci}
                                day={cell.day}
                                events={evs}
                                isToday={key === todayStr}
                                isOtherMonth={isOther}
                                isSelected={selDate === key}
                                onSelect={() => setSelDate(key)}
                              />
                            );
                          })}
                        </SimpleGrid>
                      ))}
                    </VStack>
                  )}

                  {/* Legend */}
                  <HStack mt={4} spacing={4} flexWrap="wrap">
                    {Object.entries({
                      '#e53e3e': 'CC Due',
                      '#3182ce': 'Loan EMI',
                      '#805ad5': 'Subscription',
                      '#319795': 'Insurance',
                      '#d69e2e': 'Goal',
                      '#38a169': 'Budget',
                    }).map(([color, lbl]) => (
                      <HStack key={lbl} spacing={1}>
                        <Box w="8px" h="8px" borderRadius="full" bg={color} />
                        <Text fontSize="9px" color="gray.500">{lbl}</Text>
                      </HStack>
                    ))}
                  </HStack>
                </GlassCard>

                {/* Selected date events */}
                <Box>
                  <Text fontSize="sm" fontWeight="semibold" mb={3} color="gray.600" _dark={{ color: 'gray.300' }}>
                    {selDate
                      ? isoToDate(selDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Select a date'}
                  </Text>
                  {selectedEvents.length === 0 ? (
                    <GlassCard>
                      <Text textAlign="center" color="gray.400" py={6} fontSize="sm">
                        {selDate ? 'No events on this day' : 'Click a date to see events'}
                      </Text>
                    </GlassCard>
                  ) : (
                    <VStack spacing={2} align="stretch">
                      {selectedEvents.map((ev, i) => <EventRow key={i} ev={ev} />)}
                    </VStack>
                  )}

                  {/* Today's upcoming summary */}
                  {upcomingQuery.data && upcoming.length > 0 && (
                    <Box mt={6}>
                      <Divider mb={3} />
                      <Text fontSize="xs" color="gray.400" fontWeight="semibold" mb={2}>
                        TOTAL DUE IN NEXT 30 DAYS
                      </Text>
                      <Text fontSize="xl" fontWeight="black" color="purple.600">
                        {formatINR(totalUpcomingAmount)}
                      </Text>
                      <Text fontSize="xs" color="gray.400">{upcoming.length} events</Text>
                    </Box>
                  )}
                </Box>
              </SimpleGrid>
            </TabPanel>

            {/* ══ UPCOMING LIST ════════════════════════════════════════════════ */}
            <TabPanel px={0} pt={4}>
              {upcomingQuery.isLoading ? (
                <Box textAlign="center" py={8}><Spinner color="purple.500" /></Box>
              ) : (
                <VStack align="stretch" spacing={6}>
                  {/* Group by urgency */}
                  {(['overdue','critical','urgent','soon','upcoming'] as const).map(urgency => {
                    const evs = upcoming.filter(e => e.urgency === urgency);
                    if (!evs.length) return null;
                    return (
                      <Box key={urgency}>
                        <HStack mb={3} spacing={2}>
                          <Badge colorScheme={URGENCY_COLOR[urgency]} variant="solid" fontSize="10px">
                            {URGENCY_LABEL[urgency]}
                          </Badge>
                          <Text fontSize="xs" color="gray.400">{evs.length} event{evs.length > 1 ? 's' : ''}</Text>
                          {evs[0].amount > 0 && (
                            <Text fontSize="xs" color="gray.400">
                              · Total: {formatINR(evs.reduce((s, e) => s + e.amount, 0))}
                            </Text>
                          )}
                        </HStack>
                        <VStack spacing={2} align="stretch">
                          {evs.map((ev, i) => <EventRow key={i} ev={ev} />)}
                        </VStack>
                      </Box>
                    );
                  })}

                  {!upcoming.length && (
                    <GlassCard>
                      <Text textAlign="center" color="gray.400" py={8} fontSize="sm">
                        No upcoming events in the next 30 days.
                        Add credit cards, loans, subscriptions, or insurance to see events here.
                      </Text>
                    </GlassCard>
                  )}

                  {/* Type breakdown */}
                  {upcoming.length > 0 && (
                    <GlassCard p={4}>
                      <Text fontSize="sm" fontWeight="semibold" mb={3}>By Category</Text>
                      <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3}>
                        {(['cc_due','loan_emi','subscription','insurance','goal_deadline','budget_month'] as const).map(type => {
                          const evs = upcoming.filter(e => e.type === type);
                          if (!evs.length) return null;
                          const total = evs.reduce((s, e) => s + e.amount, 0);
                          const meta  = { cc_due: { icon:'💳', label:'CC Due' }, loan_emi: { icon:'🏦', label:'Loan EMIs' }, subscription: { icon:'🔄', label:'Subscriptions' }, insurance: { icon:'🛡️', label:'Insurance' }, goal_deadline: { icon:'🎯', label:'Goals' }, budget_month: { icon:'📋', label:'Budgets' } }[type];
                          return (
                            <Box key={type} p={3} borderRadius="lg" bg={useColorModeValue('gray.50','gray.700')}>
                              <Text fontSize="lg">{meta.icon}</Text>
                              <Text fontSize="xs" color="gray.500" mt={1}>{meta.label}</Text>
                              <Text fontWeight="bold" fontSize="sm">{evs.length} event{evs.length > 1 ? 's' : ''}</Text>
                              {total > 0 && <Text fontSize="xs" color="purple.500">{formatINR(total)}</Text>}
                            </Box>
                          );
                        })}
                      </SimpleGrid>
                    </GlassCard>
                  )}
                </VStack>
              )}
            </TabPanel>

          </TabPanels>
        </Tabs>
      </VStack>
    </PageWrapper>
  );
}
