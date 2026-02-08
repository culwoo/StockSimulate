export function sortIsoDates(dates: string[]): string[] {
  return [...dates].sort((a, b) => a.localeCompare(b));
}

export function toUtcDate(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00Z`);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isQuarterStartMonth(month: number): boolean {
  return month === 0 || month === 3 || month === 6 || month === 9;
}

export function getFirstTradingDayOfMonth(
  tradingDays: string[],
  year: number,
  month: number
): string | null {
  for (const day of tradingDays) {
    const parsed = toUtcDate(day);
    if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month) {
      return day;
    }
  }
  return null;
}

export function buildTradingSchedules(tradingDays: string[]): {
  contributionDays: Set<string>;
  rebalanceDays: Set<string>;
} {
  const sorted = sortIsoDates(tradingDays);
  const contributionDays = new Set<string>();
  const rebalanceDays = new Set<string>();

  let currentMonthKey = "";

  for (const day of sorted) {
    const parsed = toUtcDate(day);
    const monthKey = `${parsed.getUTCFullYear()}-${parsed.getUTCMonth()}`;

    if (monthKey !== currentMonthKey) {
      contributionDays.add(day);
      if (isQuarterStartMonth(parsed.getUTCMonth())) {
        rebalanceDays.add(day);
      }
      currentMonthKey = monthKey;
    }
  }

  return { contributionDays, rebalanceDays };
}

