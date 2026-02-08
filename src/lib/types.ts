export type RebalanceFrequency = "quarterly";
export type ContributionRule = "first_trading_day";
export type DividendPolicy = "to_cash" | "reinvest_same_asset";

export interface EtfInfo {
  ticker: string;
  name: string;
  expenseRatio: number;
  category: string;
}

export interface PricePoint {
  date: string;
  close: number;
  adjustedClose: number;
  dividendPerShare: number;
  splitRatio: number;
}

export interface AllocationInput {
  ticker: string;
  targetWeight: number;
  expenseRatio: number;
}

export interface SimulationRequest {
  startDate: string;
  endDate: string;
  initialAmount: number;
  monthlySalary: number;
  monthlyContribution: number;
  minimumCashReserve: number;
  dividendPolicy: DividendPolicy;
  allocations: AllocationInput[];
  rebalanceFrequency: RebalanceFrequency;
  contributionRule: ContributionRule;
  benchmarkTicker: string;
  riskFreeRate?: number;
}

export interface TimelinePoint {
  date: string;
  stockValue: number;
  cashValue: number;
  portfolioValue: number;
  benchmarkValue: number;
  investedCapital: number;
  netFlow: number;
}

export interface DrawdownPoint {
  date: string;
  portfolioDrawdown: number;
  benchmarkDrawdown: number;
}

export interface YearlyReturnPoint {
  year: number;
  portfolioReturn: number;
  benchmarkReturn: number;
}

export interface PerformanceMetrics {
  endingValue: number;
  totalInvested: number;
  gains: number;
  cumulativeReturn: number;
  contributionAdjustedCagr: number;
  growthCagr: number;
  maxDrawdown: number;
  annualizedVolatility: number;
  sharpeRatio: number;
}

export interface SimulationResult {
  timeline: TimelinePoint[];
  metrics: {
    portfolio: PerformanceMetrics;
    benchmark: PerformanceMetrics;
  };
  yearlyReturns: YearlyReturnPoint[];
  drawdown: DrawdownPoint[];
  cashflowBreakdown: {
    initialPrincipal: number;
    contributions: number;
    totalInvested: number;
    gains: number;
    endingCash: number;
    endingStockValue: number;
  };
}

export interface BenchmarkSummaryResponse {
  ticker: string;
  startDate: string;
  endDate: string;
  metrics: {
    cumulativeReturn: number;
    cagr: number;
    maxDrawdown: number;
    annualizedVolatility: number;
    sharpeRatio: number;
  };
}

