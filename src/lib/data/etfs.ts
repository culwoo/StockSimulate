import { EtfInfo } from "@/lib/types";

export const ETF_UNIVERSE: EtfInfo[] = [
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", expenseRatio: 0.0009, category: "Large Cap" },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", expenseRatio: 0.0003, category: "Large Cap" },
  { ticker: "IVV", name: "iShares Core S&P 500 ETF", expenseRatio: 0.0003, category: "Large Cap" },
  { ticker: "QQQ", name: "Invesco QQQ Trust (NASDAQ-100)", expenseRatio: 0.002, category: "Nasdaq" },
  { ticker: "QQQM", name: "Invesco NASDAQ 100 ETF", expenseRatio: 0.0015, category: "Nasdaq" },
  { ticker: "ONEQ", name: "Fidelity NASDAQ Composite Index ETF", expenseRatio: 0.0021, category: "Nasdaq" },
  { ticker: "BRK-B", name: "Berkshire Hathaway Inc. Class B", expenseRatio: 0, category: "Stock" },
  { ticker: "PLTR", name: "Palantir Technologies Inc.", expenseRatio: 0, category: "Stock" },
  { ticker: "RKLB", name: "Rocket Lab USA, Inc.", expenseRatio: 0, category: "Stock" },
  { ticker: "AAPL", name: "Apple Inc.", expenseRatio: 0, category: "Stock" },
  { ticker: "MSFT", name: "Microsoft Corporation", expenseRatio: 0, category: "Stock" },
  { ticker: "NVDA", name: "NVIDIA Corporation", expenseRatio: 0, category: "Stock" },
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", expenseRatio: 0.0003, category: "Broad Market" },
  { ticker: "SCHD", name: "Schwab U.S. Dividend Equity ETF", expenseRatio: 0.0006, category: "Dividend" },
  { ticker: "VYM", name: "Vanguard High Dividend Yield ETF", expenseRatio: 0.0006, category: "Dividend" },
  { ticker: "IWM", name: "iShares Russell 2000 ETF", expenseRatio: 0.0019, category: "Small Cap" },
  { ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF", expenseRatio: 0.0016, category: "Large Cap" },
  { ticker: "TLT", name: "iShares 20+ Year Treasury Bond ETF", expenseRatio: 0.0015, category: "Bond" },
  { ticker: "IEF", name: "iShares 7-10 Year Treasury Bond ETF", expenseRatio: 0.0015, category: "Bond" },
  { ticker: "BND", name: "Vanguard Total Bond Market ETF", expenseRatio: 0.0003, category: "Bond" },
  { ticker: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", expenseRatio: 0.0003, category: "Bond" },
  { ticker: "GLD", name: "SPDR Gold Shares", expenseRatio: 0.004, category: "Commodity" },
  { ticker: "SLV", name: "iShares Silver Trust", expenseRatio: 0.005, category: "Commodity" },
  { ticker: "VNQ", name: "Vanguard Real Estate ETF", expenseRatio: 0.0012, category: "Real Estate" },
  { ticker: "XLK", name: "Technology Select Sector SPDR Fund", expenseRatio: 0.0009, category: "Sector" },
  { ticker: "SOXX", name: "iShares Semiconductor ETF", expenseRatio: 0.0035, category: "Sector" },
  { ticker: "XLF", name: "Financial Select Sector SPDR Fund", expenseRatio: 0.0009, category: "Sector" },
  { ticker: "XLE", name: "Energy Select Sector SPDR Fund", expenseRatio: 0.0009, category: "Sector" },
  { ticker: "XLY", name: "Consumer Discretionary Select Sector SPDR Fund", expenseRatio: 0.0009, category: "Sector" },
  { ticker: "VUG", name: "Vanguard Growth ETF", expenseRatio: 0.0004, category: "Style" },
  { ticker: "VTV", name: "Vanguard Value ETF", expenseRatio: 0.0004, category: "Style" },
  { ticker: "USMV", name: "iShares MSCI USA Min Vol Factor ETF", expenseRatio: 0.0015, category: "Factor" },
  { ticker: "MTUM", name: "iShares MSCI USA Momentum Factor ETF", expenseRatio: 0.0015, category: "Factor" },
  { ticker: "VEA", name: "Vanguard FTSE Developed Markets ETF", expenseRatio: 0.0006, category: "International" },
  { ticker: "VWO", name: "Vanguard FTSE Emerging Markets ETF", expenseRatio: 0.0008, category: "International" },
  { ticker: "EFA", name: "iShares MSCI EAFE ETF", expenseRatio: 0.0032, category: "International" },
  { ticker: "EEM", name: "iShares MSCI Emerging Markets ETF", expenseRatio: 0.0069, category: "International" }
];

export const DEFAULT_COMPARE_TICKERS = ["SPY", "QQQ", "VTI", "VOO", "SCHD", "TLT", "GLD"];

export const BENCHMARK_CANDIDATES = [
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "VTI",
  "TLT",
  "GLD",
  "BRK-B",
  "PLTR",
  "RKLB",
  "SOXX",
  "AAPL",
  "MSFT",
  "NVDA"
];

export const ETF_LOOKUP: Record<string, EtfInfo> = ETF_UNIVERSE.reduce<Record<string, EtfInfo>>(
  (accumulator, etf) => {
    accumulator[etf.ticker] = etf;
    return accumulator;
  },
  {}
);

export function searchEtfs(query: string): EtfInfo[] {
  const normalized = query.trim().toUpperCase();
  if (!normalized) {
    return ETF_UNIVERSE;
  }

  return ETF_UNIVERSE.filter((etf) => {
    return etf.ticker.includes(normalized) || etf.name.toUpperCase().includes(normalized);
  });
}

export function getEtfByTicker(ticker: string): EtfInfo | undefined {
  return ETF_LOOKUP[ticker.toUpperCase()];
}

