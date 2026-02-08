import { calculateAnnualizedVolatility, calculateCagr, calculateMaxDrawdown, calculateSharpe } from "@/lib/metrics";
import { BenchmarkSummaryResponse, PricePoint } from "@/lib/types";

function calculateSimpleDailyReturns(points: PricePoint[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].adjustedClose;
    const current = points[index].adjustedClose;

    if (previous <= 0) {
      returns.push(0);
    } else {
      returns.push(current / previous - 1);
    }
  }
  return returns;
}

export function buildBenchmarkSummary(input: {
  ticker: string;
  points: PricePoint[];
  riskFreeRate?: number;
}): BenchmarkSummaryResponse {
  const { ticker, points, riskFreeRate = 0.02 } = input;

  const start = points[0];
  const end = points[points.length - 1];

  const dailyReturns = calculateSimpleDailyReturns(points);
  const cumulativeReturn = start.adjustedClose > 0 ? end.adjustedClose / start.adjustedClose - 1 : 0;

  const years =
    (new Date(`${end.date}T00:00:00Z`).getTime() -
      new Date(`${start.date}T00:00:00Z`).getTime()) /
    (365.25 * 24 * 60 * 60 * 1000);

  const cagr = calculateCagr(start.adjustedClose, end.adjustedClose, years);
  const annualizedVolatility = calculateAnnualizedVolatility(dailyReturns);
  const sharpeRatio = calculateSharpe(cagr, annualizedVolatility, riskFreeRate);
  const maxDrawdown = calculateMaxDrawdown(points.map((point) => point.adjustedClose));

  return {
    ticker,
    startDate: start.date,
    endDate: end.date,
    metrics: {
      cumulativeReturn,
      cagr,
      maxDrawdown,
      annualizedVolatility,
      sharpeRatio
    }
  };
}

