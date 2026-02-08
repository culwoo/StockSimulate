import { buildTradingSchedules, sortIsoDates } from "@/lib/calendar";
import {
  calculateDrawdownSeries,
  calculatePerformanceMetrics,
  calculateTimeWeightedDailyReturns,
  calculateYearlyReturnSeries
} from "@/lib/metrics";
import { SimulationRequestInput } from "@/lib/schemas/simulation";
import { PricePoint, SimulationResult } from "@/lib/types";
import { getHistoricalSeries } from "@/lib/yahoo";

const WEIGHT_DRIFT_TOLERANCE = 0.005;
const TRADING_DAYS_PER_YEAR = 252;
const MONTHLY_LIVING_COST = 1_000_000;

type NormalizedAllocation = {
  ticker: string;
  weight: number;
  expenseRatio: number;
};

function toCloseMap(points: PricePoint[]): Map<string, number> {
  return new Map(points.map((point) => [point.date, point.close]));
}

function toAdjustedMap(points: PricePoint[]): Map<string, number> {
  return new Map(points.map((point) => [point.date, point.adjustedClose]));
}

function toDividendMap(points: PricePoint[]): Map<string, number> {
  return new Map(
    points
      .filter((point) => point.dividendPerShare > 0)
      .map((point) => [point.date, point.dividendPerShare])
  );
}

function toSplitMap(points: PricePoint[]): Map<string, number> {
  return new Map(
    points
      .filter((point) => point.splitRatio > 0 && point.splitRatio !== 1)
      .map((point) => [point.date, point.splitRatio])
  );
}

function intersectDates(dateLists: string[][]): string[] {
  if (dateLists.length === 0) {
    return [];
  }

  const [first, ...rest] = dateLists;
  return sortIsoDates(first).filter((date) => rest.every((dates) => dates.includes(date)));
}

function normalizeAllocations(
  allocations: SimulationRequestInput["allocations"]
): NormalizedAllocation[] {
  return allocations.map((allocation) => ({
    ticker: allocation.ticker.toUpperCase(),
    weight: allocation.targetWeight / 100,
    expenseRatio: allocation.expenseRatio
  }));
}

function getTotalStockWeight(allocations: NormalizedAllocation[]): number {
  return allocations.reduce((sum, allocation) => sum + allocation.weight, 0);
}

function computeDesiredStockBudget(
  portfolioValue: number,
  totalStockWeight: number,
  minimumCashReserve: number
): number {
  if (portfolioValue <= 0 || totalStockWeight <= 0) {
    return 0;
  }

  const cashFloor = Math.min(minimumCashReserve, portfolioValue);
  const desiredStock = portfolioValue * totalStockWeight;
  const maxStockWithFloor = Math.max(0, portfolioValue - cashFloor);

  return Math.max(0, Math.min(desiredStock, maxStockWithFloor));
}

function investByRelativeStockWeights(
  amount: number,
  day: string,
  allocations: NormalizedAllocation[],
  holdings: Record<string, number>,
  closeMaps: Record<string, Map<string, number>>
): number {
  if (amount <= 0) {
    return 0;
  }

  const totalStockWeight = getTotalStockWeight(allocations);
  if (totalStockWeight <= 0) {
    return 0;
  }

  let invested = 0;
  for (const allocation of allocations) {
    const price = closeMaps[allocation.ticker].get(day);
    if (!price || price <= 0) {
      continue;
    }

    const relativeWeight = allocation.weight / totalStockWeight;
    const allocationAmount = amount * relativeWeight;
    holdings[allocation.ticker] = (holdings[allocation.ticker] ?? 0) + allocationAmount / price;
    invested += allocationAmount;
  }

  return invested;
}

function applyDailyExpenseDrag(
  allocations: NormalizedAllocation[],
  holdings: Record<string, number>
): void {
  for (const allocation of allocations) {
    const feeDrag = allocation.expenseRatio / TRADING_DAYS_PER_YEAR;
    holdings[allocation.ticker] = (holdings[allocation.ticker] ?? 0) * (1 - feeDrag);
  }
}

function applySplitEvents(
  day: string,
  allocations: NormalizedAllocation[],
  holdings: Record<string, number>,
  splitMaps: Record<string, Map<string, number>>
): void {
  for (const allocation of allocations) {
    const ratio = splitMaps[allocation.ticker].get(day);
    if (!ratio || ratio <= 0 || ratio === 1) {
      continue;
    }

    holdings[allocation.ticker] = (holdings[allocation.ticker] ?? 0) * ratio;
  }
}

function applyDividendEvents(input: {
  day: string;
  allocations: NormalizedAllocation[];
  holdings: Record<string, number>;
  closeMaps: Record<string, Map<string, number>>;
  dividendMaps: Record<string, Map<string, number>>;
  dividendPolicy: SimulationRequestInput["dividendPolicy"];
  cashValue: number;
}): number {
  const { day, allocations, holdings, closeMaps, dividendMaps, dividendPolicy } = input;
  let nextCash = input.cashValue;

  for (const allocation of allocations) {
    const perShare = dividendMaps[allocation.ticker].get(day) ?? 0;
    if (perShare <= 0) {
      continue;
    }

    const shares = holdings[allocation.ticker] ?? 0;
    if (shares <= 0) {
      continue;
    }

    const payout = shares * perShare;
    if (payout <= 0) {
      continue;
    }

    if (dividendPolicy === "to_cash") {
      nextCash += payout;
      continue;
    }

    const price = closeMaps[allocation.ticker].get(day) ?? 0;
    if (price > 0) {
      holdings[allocation.ticker] = shares + payout / price;
    } else {
      nextCash += payout;
    }
  }

  return nextCash;
}

function computeStockValue(
  day: string,
  allocations: NormalizedAllocation[],
  holdings: Record<string, number>,
  closeMaps: Record<string, Map<string, number>>
): number {
  return allocations.reduce((total, allocation) => {
    const price = closeMaps[allocation.ticker].get(day) ?? 0;
    const shares = holdings[allocation.ticker] ?? 0;
    return total + shares * price;
  }, 0);
}

function computePortfolioValue(stockValue: number, cashValue: number): number {
  return stockValue + cashValue;
}

function getCurrentWeights(
  day: string,
  allocations: NormalizedAllocation[],
  holdings: Record<string, number>,
  closeMaps: Record<string, Map<string, number>>,
  portfolioValue: number
): Record<string, number> {
  const weights: Record<string, number> = {};

  for (const allocation of allocations) {
    const price = closeMaps[allocation.ticker].get(day) ?? 0;
    const positionValue = (holdings[allocation.ticker] ?? 0) * price;
    weights[allocation.ticker] = portfolioValue > 0 ? positionValue / portfolioValue : 0;
  }

  return weights;
}

function shouldRebalance(
  day: string,
  allocations: NormalizedAllocation[],
  holdings: Record<string, number>,
  closeMaps: Record<string, Map<string, number>>,
  cashValue: number,
  minimumCashReserve: number
): boolean {
  const stockValue = computeStockValue(day, allocations, holdings, closeMaps);
  const portfolioValue = computePortfolioValue(stockValue, cashValue);
  if (portfolioValue <= 0) {
    return false;
  }

  const totalStockWeight = getTotalStockWeight(allocations);
  const currentWeights = getCurrentWeights(day, allocations, holdings, closeMaps, portfolioValue);
  const targetStockBudget = computeDesiredStockBudget(
    portfolioValue,
    totalStockWeight,
    minimumCashReserve
  );
  const targetCashWeight = portfolioValue > 0 ? (portfolioValue - targetStockBudget) / portfolioValue : 0;
  const currentCashWeight = portfolioValue > 0 ? cashValue / portfolioValue : 0;

  if (Math.abs(currentCashWeight - targetCashWeight) > WEIGHT_DRIFT_TOLERANCE) {
    return true;
  }

  if (totalStockWeight <= 0 || targetStockBudget <= 0) {
    return false;
  }

  return allocations.some((allocation) => {
    const relativeWeight = allocation.weight / totalStockWeight;
    const targetWeight = (targetStockBudget * relativeWeight) / portfolioValue;
    return Math.abs((currentWeights[allocation.ticker] ?? 0) - targetWeight) > WEIGHT_DRIFT_TOLERANCE;
  });
}

function rebalancePortfolio(
  day: string,
  allocations: NormalizedAllocation[],
  holdings: Record<string, number>,
  closeMaps: Record<string, Map<string, number>>,
  cashValue: number,
  minimumCashReserve: number
): number {
  const stockValue = computeStockValue(day, allocations, holdings, closeMaps);
  const portfolioValue = computePortfolioValue(stockValue, cashValue);
  if (portfolioValue <= 0) {
    return cashValue;
  }

  const totalStockWeight = getTotalStockWeight(allocations);
  const targetStockBudget = computeDesiredStockBudget(
    portfolioValue,
    totalStockWeight,
    minimumCashReserve
  );

  if (targetStockBudget <= 0 || totalStockWeight <= 0) {
    for (const allocation of allocations) {
      holdings[allocation.ticker] = 0;
    }
    return portfolioValue;
  }

  let targetStockValue = 0;

  for (const allocation of allocations) {
    const price = closeMaps[allocation.ticker].get(day);
    if (!price || price <= 0) {
      continue;
    }

    const relativeWeight = allocation.weight / totalStockWeight;
    const targetValue = targetStockBudget * relativeWeight;
    holdings[allocation.ticker] = targetValue / price;
    targetStockValue += targetValue;
  }

  return Math.max(0, portfolioValue - targetStockValue);
}

export async function runSimulation(request: SimulationRequestInput): Promise<SimulationResult> {
  const benchmarkTicker = request.benchmarkTicker.toUpperCase();
  const allocations = normalizeAllocations(request.allocations).filter(
    (allocation) => allocation.weight > 0
  );

  if (allocations.length === 0) {
    throw new Error("At least one allocation weight must be greater than 0");
  }

  const tickers = [...new Set([...allocations.map((allocation) => allocation.ticker), benchmarkTicker])];
  const histories = await Promise.all(
    tickers.map(async (ticker) => {
      const points = await getHistoricalSeries(ticker, request.startDate, request.endDate);
      return { ticker, points };
    })
  );

  const historyMap: Record<string, PricePoint[]> = histories.reduce<Record<string, PricePoint[]>>(
    (accumulator, entry) => {
      accumulator[entry.ticker] = entry.points;
      return accumulator;
    },
    {}
  );

  const relevantDateLists = [
    ...allocations.map((allocation) => historyMap[allocation.ticker].map((point) => point.date)),
    historyMap[benchmarkTicker].map((point) => point.date)
  ];

  const tradingDays = intersectDates(relevantDateLists);

  if (tradingDays.length < 2) {
    throw new Error("Insufficient overlapping trading days for selected ETFs and benchmark");
  }

  const closeMaps = Object.fromEntries(
    tickers.map((ticker) => [ticker, toCloseMap(historyMap[ticker])])
  ) as Record<string, Map<string, number>>;

  const adjustedMaps = Object.fromEntries(
    tickers.map((ticker) => [ticker, toAdjustedMap(historyMap[ticker])])
  ) as Record<string, Map<string, number>>;

  const dividendMaps = Object.fromEntries(
    tickers.map((ticker) => [ticker, toDividendMap(historyMap[ticker])])
  ) as Record<string, Map<string, number>>;

  const splitMaps = Object.fromEntries(
    tickers.map((ticker) => [ticker, toSplitMap(historyMap[ticker])])
  ) as Record<string, Map<string, number>>;

  const { contributionDays, rebalanceDays } = buildTradingSchedules(tradingDays);
  const holdings: Record<string, number> = Object.fromEntries(
    allocations.map((allocation) => [allocation.ticker, 0])
  );

  const totalStockWeight = getTotalStockWeight(allocations);

  let benchmarkShares = 0;
  let totalInvested = 0;
  let contributions = 0;
  let cashValue = 0;

  const timeline: SimulationResult["timeline"] = [];

  for (let index = 0; index < tradingDays.length; index += 1) {
    const day = tradingDays[index];
    let netFlow = 0;

    applySplitEvents(day, allocations, holdings, splitMaps);
    cashValue = applyDividendEvents({
      day,
      allocations,
      holdings,
      closeMaps,
      dividendMaps,
      dividendPolicy: request.dividendPolicy,
      cashValue
    });

    if (index === 0 && request.initialAmount > 0) {
      const benchmarkPrice = adjustedMaps[benchmarkTicker].get(day) ?? 0;

      cashValue += request.initialAmount;
      totalInvested += request.initialAmount;
      netFlow += request.initialAmount;

      const initialStockBudget = computeDesiredStockBudget(
        cashValue,
        totalStockWeight,
        request.minimumCashReserve
      );
      const spentInitial = investByRelativeStockWeights(
        initialStockBudget,
        day,
        allocations,
        holdings,
        closeMaps
      );
      cashValue -= spentInitial;

      if (benchmarkPrice > 0) {
        benchmarkShares += request.initialAmount / benchmarkPrice;
      }
    }

    if (contributionDays.has(day)) {
      const benchmarkPrice = adjustedMaps[benchmarkTicker].get(day) ?? 0;
      const salaryNet = Math.max(0, request.monthlySalary - MONTHLY_LIVING_COST);

      if (salaryNet > 0) {
        cashValue += salaryNet;
        totalInvested += salaryNet;
        contributions += salaryNet;
        netFlow += salaryNet;

        if (benchmarkPrice > 0) {
          benchmarkShares += salaryNet / benchmarkPrice;
        }
      }

      const investable = Math.max(0, cashValue - request.minimumCashReserve);
      if (request.monthlyContribution > 0 && investable > 0) {
        const actualContribution = Math.min(request.monthlyContribution, investable);
        const spentContribution = investByRelativeStockWeights(
          actualContribution,
          day,
          allocations,
          holdings,
          closeMaps
        );
        cashValue -= spentContribution;
      }
    }

    applyDailyExpenseDrag(allocations, holdings);

    if (
      index > 0 &&
      rebalanceDays.has(day) &&
      shouldRebalance(
        day,
        allocations,
        holdings,
        closeMaps,
        cashValue,
        request.minimumCashReserve
      )
    ) {
      cashValue = rebalancePortfolio(
        day,
        allocations,
        holdings,
        closeMaps,
        cashValue,
        request.minimumCashReserve
      );
    }

    const stockValue = computeStockValue(day, allocations, holdings, closeMaps);
    const portfolioValue = computePortfolioValue(stockValue, cashValue);
    const benchmarkPrice = adjustedMaps[benchmarkTicker].get(day) ?? 0;
    const benchmarkValue = benchmarkShares * benchmarkPrice;

    timeline.push({
      date: day,
      stockValue,
      cashValue,
      portfolioValue,
      benchmarkValue,
      investedCapital: totalInvested,
      netFlow
    });
  }

  const dates = timeline.map((point) => point.date);
  const portfolioValues = timeline.map((point) => point.portfolioValue);
  const benchmarkValues = timeline.map((point) => point.benchmarkValue);
  const netFlows = timeline.map((point) => point.netFlow);

  const portfolioDailyReturns = calculateTimeWeightedDailyReturns(portfolioValues, netFlows);
  const benchmarkDailyReturns = calculateTimeWeightedDailyReturns(benchmarkValues, netFlows);

  const portfolioMetrics = calculatePerformanceMetrics({
    dates,
    values: portfolioValues,
    netFlows,
    totalInvested,
    riskFreeRate: request.riskFreeRate
  });

  const benchmarkMetrics = calculatePerformanceMetrics({
    dates,
    values: benchmarkValues,
    netFlows,
    totalInvested,
    riskFreeRate: request.riskFreeRate
  });

  const yearlyReturns = calculateYearlyReturnSeries(dates, portfolioDailyReturns, benchmarkDailyReturns);
  const portfolioDrawdown = calculateDrawdownSeries(portfolioValues);
  const benchmarkDrawdown = calculateDrawdownSeries(benchmarkValues);

  const drawdown = timeline.map((point, index) => ({
    date: point.date,
    portfolioDrawdown: portfolioDrawdown[index] ?? 0,
    benchmarkDrawdown: benchmarkDrawdown[index] ?? 0
  }));

  const lastPoint = timeline[timeline.length - 1];

  return {
    timeline,
    metrics: {
      portfolio: portfolioMetrics,
      benchmark: benchmarkMetrics
    },
    yearlyReturns,
    drawdown,
    cashflowBreakdown: {
      initialPrincipal: request.initialAmount,
      contributions,
      totalInvested,
      gains: portfolioMetrics.gains,
      endingCash: lastPoint?.cashValue ?? 0,
      endingStockValue: lastPoint?.stockValue ?? 0
    }
  };
}
