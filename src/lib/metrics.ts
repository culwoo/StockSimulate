import { PerformanceMetrics, YearlyReturnPoint } from "@/lib/types";
import { toUtcDate } from "@/lib/calendar";

const TRADING_DAYS_PER_YEAR = 252;

export function calculateCagr(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || endValue <= 0 || years <= 0) {
    return 0;
  }
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

export function calculateAnnualizedVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) {
    return 0;
  }

  const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    (dailyReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export function calculateSharpe(
  annualReturn: number,
  annualizedVolatility: number,
  riskFreeRate: number
): number {
  if (annualizedVolatility <= 0) {
    return 0;
  }
  return (annualReturn - riskFreeRate) / annualizedVolatility;
}

export function chainReturns(returns: number[]): number {
  return returns.reduce((accumulator, value) => accumulator * (1 + value), 1) - 1;
}

export function calculateMaxDrawdown(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  let peak = values[0];
  let maxDrawdown = 0;

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }

    const drawdown = peak === 0 ? 0 : value / peak - 1;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

export function calculateDrawdownSeries(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  let peak = values[0];
  return values.map((value) => {
    if (value > peak) {
      peak = value;
    }
    return peak === 0 ? 0 : value / peak - 1;
  });
}

export function calculateTimeWeightedDailyReturns(values: number[], netFlows: number[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previousValue = values[index - 1];
    if (previousValue <= 0) {
      returns.push(0);
      continue;
    }

    const flow = netFlows[index] ?? 0;
    const dailyReturn = (values[index] - previousValue - flow) / previousValue;
    returns.push(Number.isFinite(dailyReturn) ? dailyReturn : 0);
  }
  return returns;
}

export function calculateYearFraction(startDateIso: string, endDateIso: string): number {
  const start = toUtcDate(startDateIso).getTime();
  const end = toUtcDate(endDateIso).getTime();
  if (end <= start) {
    return 0;
  }

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (end - start) / msPerYear;
}

function buildYearlyReturnMap(dates: string[], dailyReturns: number[]): Map<number, number> {
  const byYear = new Map<number, number>();

  for (let index = 0; index < dailyReturns.length; index += 1) {
    const date = dates[index + 1];
    if (!date) {
      continue;
    }

    const year = toUtcDate(date).getUTCFullYear();
    const existing = byYear.get(year) ?? 1;
    byYear.set(year, existing * (1 + dailyReturns[index]));
  }

  for (const [year, compounded] of byYear.entries()) {
    byYear.set(year, compounded - 1);
  }

  return byYear;
}

export function calculateYearlyReturnSeries(
  dates: string[],
  portfolioDailyReturns: number[],
  benchmarkDailyReturns: number[]
): YearlyReturnPoint[] {
  const portfolioByYear = buildYearlyReturnMap(dates, portfolioDailyReturns);
  const benchmarkByYear = buildYearlyReturnMap(dates, benchmarkDailyReturns);
  const years = [...new Set([...portfolioByYear.keys(), ...benchmarkByYear.keys()])].sort();

  return years.map((year) => ({
    year,
    portfolioReturn: portfolioByYear.get(year) ?? 0,
    benchmarkReturn: benchmarkByYear.get(year) ?? 0
  }));
}

export function calculatePerformanceMetrics(input: {
  dates: string[];
  values: number[];
  netFlows: number[];
  totalInvested: number;
  riskFreeRate: number;
}): PerformanceMetrics {
  const { dates, values, netFlows, totalInvested, riskFreeRate } = input;

  const endingValue = values[values.length - 1] ?? 0;
  const gains = endingValue - totalInvested;
  const cumulativeReturn = totalInvested > 0 ? endingValue / totalInvested - 1 : 0;

  const years = calculateYearFraction(dates[0], dates[dates.length - 1]);
  const contributionAdjustedCagr = calculateCagr(totalInvested, endingValue, years);

  const dailyReturns = calculateTimeWeightedDailyReturns(values, netFlows);
  const twrCumulative = chainReturns(dailyReturns);
  const growthCagr = calculateCagr(1, 1 + twrCumulative, years);

  const annualizedVolatility = calculateAnnualizedVolatility(dailyReturns);
  const sharpeRatio = calculateSharpe(growthCagr, annualizedVolatility, riskFreeRate);
  const maxDrawdown = calculateMaxDrawdown(values);

  return {
    endingValue,
    totalInvested,
    gains,
    cumulativeReturn,
    contributionAdjustedCagr,
    growthCagr,
    maxDrawdown,
    annualizedVolatility,
    sharpeRatio
  };
}

