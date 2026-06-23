export function formatINR(paise: number, showPaise = false): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(rupees);
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  return paise / 100;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function savingsRate(incomePaise: number, expensesPaise: number): number {
  if (incomePaise === 0) return 0;
  return Math.max(0, Math.round(((incomePaise - expensesPaise) / incomePaise) * 100));
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'orange';
  return 'red';
}

export function getCurrentMonthYear(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function getIndianFiscalYear(date = new Date()): { start: Date; end: Date; label: string } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const fyYear = month >= 4 ? year : year - 1;
  return {
    start: new Date(fyYear, 3, 1),        // April 1
    end: new Date(fyYear + 1, 2, 31),     // March 31 next year
    label: `FY ${fyYear}-${String(fyYear + 1).slice(2)}`,
  };
}
