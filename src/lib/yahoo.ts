import { getCached, setCached } from "@/lib/cache";
import { EtfInfo, PricePoint } from "@/lib/types";

const YAHOO_CHART_ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_SEARCH_ENDPOINT = "https://query2.finance.yahoo.com/v1/finance/search";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const RETRY_DELAYS_MS = [250, 600, 1200];
const US_EXCHANGES = new Set([
  "NMS",
  "NCM",
  "NGM",
  "NYQ",
  "ASE",
  "PCX",
  "BTS",
  "NYS",
  "AMEX",
  "NYSE",
  "NASDAQ",
  "ARCA"
]);

export class YahooDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YahooDataError";
  }
}

function toUnixTimestamp(dateIso: string, inclusiveEnd = false): number {
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new YahooDataError(`Invalid date format: ${dateIso}`);
  }

  if (inclusiveEnd) {
    return Math.floor(date.getTime() / 1000) + 24 * 60 * 60;
  }
  return Math.floor(date.getTime() / 1000);
}

function toIsoDateFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function fetchWithRetry(url: string, retries = RETRY_DELAYS_MS.length): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "StockSimulate/1.0"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new YahooDataError(`Yahoo Finance request failed with status ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        const delayMs = RETRY_DELAYS_MS[attempt] ?? 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new YahooDataError(
    lastError instanceof Error ? lastError.message : "Failed to request Yahoo Finance"
  );
}

function buildCacheKey(ticker: string, startDate: string, endDate: string): string {
  return `yahoo:${ticker}:${startDate}:${endDate}`;
}

function buildSearchCacheKey(query: string, limit: number): string {
  return `yahoo-search:${query.toUpperCase()}:${limit}`;
}

function isUsExchange(exchange: string | undefined, exchangeDisplayName: string | undefined): boolean {
  const normalizedExchange = (exchange ?? "").toUpperCase();
  if (US_EXCHANGES.has(normalizedExchange)) {
    return true;
  }

  const normalizedDisplay = (exchangeDisplayName ?? "").toUpperCase();
  return (
    normalizedDisplay.includes("NASDAQ") ||
    normalizedDisplay.includes("NYSE") ||
    normalizedDisplay.includes("AMEX") ||
    normalizedDisplay.includes("ARCA")
  );
}

function toSearchCategory(quoteType: string | undefined): string {
  const normalized = (quoteType ?? "").toUpperCase();
  if (normalized === "ETF") {
    return "ETF";
  }
  if (normalized === "EQUITY") {
    return "Stock";
  }
  return "Asset";
}

function toSplitRatio(split: unknown): number {
  if (!split || typeof split !== "object") {
    return 1;
  }

  const numerator = Number((split as { numerator?: unknown }).numerator);
  const denominator = Number((split as { denominator?: unknown }).denominator);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
    return numerator / denominator;
  }

  const ratioText = (split as { splitRatio?: unknown }).splitRatio;
  if (typeof ratioText === "string") {
    const [left, right] = ratioText.split("/").map((part) => Number(part));
    if (Number.isFinite(left) && Number.isFinite(right) && right > 0) {
      return left / right;
    }
  }

  return 1;
}

function buildDividendMap(result: unknown): Map<string, number> {
  const map = new Map<string, number>();
  const dividends = (result as { events?: { dividends?: Record<string, unknown> } })?.events?.dividends;
  if (!dividends || typeof dividends !== "object") {
    return map;
  }

  for (const [timestamp, entry] of Object.entries(dividends)) {
    const rawAmount = Number((entry as { amount?: unknown }).amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      continue;
    }

    const rawDate = Number((entry as { date?: unknown }).date);
    const seconds = Number.isFinite(rawDate) ? rawDate : Number(timestamp);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      continue;
    }

    const date = toIsoDateFromUnix(seconds);
    const existing = map.get(date) ?? 0;
    map.set(date, existing + rawAmount);
  }

  return map;
}

function buildSplitMap(result: unknown): Map<string, number> {
  const map = new Map<string, number>();
  const splits = (result as { events?: { splits?: Record<string, unknown> } })?.events?.splits;
  if (!splits || typeof splits !== "object") {
    return map;
  }

  for (const [timestamp, entry] of Object.entries(splits)) {
    const ratio = toSplitRatio(entry);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio === 1) {
      continue;
    }

    const rawDate = Number((entry as { date?: unknown }).date);
    const seconds = Number.isFinite(rawDate) ? rawDate : Number(timestamp);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      continue;
    }

    const date = toIsoDateFromUnix(seconds);
    const existing = map.get(date) ?? 1;
    map.set(date, existing * ratio);
  }

  return map;
}

export async function getHistoricalSeries(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<PricePoint[]> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    throw new YahooDataError("Ticker is required");
  }

  const cacheKey = buildCacheKey(normalizedTicker, startDate, endDate);
  const cached = getCached<PricePoint[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const period1 = toUnixTimestamp(startDate);
  const period2 = toUnixTimestamp(endDate, true);
  const url = `${YAHOO_CHART_ENDPOINT}/${normalizedTicker}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits&includeAdjustedClose=true`;

  const response = await fetchWithRetry(url);
  const payload = await response.json();

  const result = payload?.chart?.result?.[0];
  const error = payload?.chart?.error;

  if (error) {
    throw new YahooDataError(`Yahoo Finance error for ${normalizedTicker}: ${error.description}`);
  }

  const timestamps: number[] | undefined = result?.timestamp;
  const adjustedCloses: (number | null)[] | undefined = result?.indicators?.adjclose?.[0]?.adjclose;
  const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;

  if (!timestamps || !Array.isArray(timestamps) || timestamps.length === 0) {
    throw new YahooDataError(`No price history available for ${normalizedTicker}`);
  }

  const dividendsByDate = buildDividendMap(result);
  const splitsByDate = buildSplitMap(result);

  const points: PricePoint[] = timestamps
    .map((timestamp, index) => {
      const close = closes?.[index] ?? adjustedCloses?.[index] ?? null;
      const adjustedClose = adjustedCloses?.[index] ?? closes?.[index] ?? null;
      if (
        close === null ||
        adjustedClose === null ||
        !Number.isFinite(close) ||
        !Number.isFinite(adjustedClose)
      ) {
        return null;
      }

      const date = toIsoDateFromUnix(timestamp);
      return {
        date,
        close,
        adjustedClose,
        dividendPerShare: dividendsByDate.get(date) ?? 0,
        splitRatio: splitsByDate.get(date) ?? 1
      } satisfies PricePoint;
    })
    .filter((point): point is PricePoint => point !== null)
    .filter((point) => point.date >= startDate && point.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    throw new YahooDataError(`No adjusted close values found for ${normalizedTicker}`);
  }

  setCached(cacheKey, points, DEFAULT_CACHE_TTL_MS);
  return points;
}

export async function searchSymbols(query: string, limit = 30): Promise<EtfInfo[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const cacheKey = buildSearchCacheKey(normalizedQuery, limit);
  const cached = getCached<EtfInfo[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${YAHOO_SEARCH_ENDPOINT}?q=${encodeURIComponent(normalizedQuery)}&quotesCount=50&newsCount=0&enableFuzzyQuery=true`;
  const response = await fetchWithRetry(url);
  const payload = await response.json();

  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const items: EtfInfo[] = [];
  const seen = new Set<string>();

  for (const quote of quotes) {
    const ticker = typeof quote?.symbol === "string" ? quote.symbol.toUpperCase() : "";
    if (!ticker || seen.has(ticker)) {
      continue;
    }

    const quoteType = typeof quote?.quoteType === "string" ? quote.quoteType : "";
    if (quoteType !== "ETF" && quoteType !== "EQUITY") {
      continue;
    }

    const exchange = typeof quote?.exchange === "string" ? quote.exchange : undefined;
    const exchDisp = typeof quote?.exchDisp === "string" ? quote.exchDisp : undefined;
    if (!isUsExchange(exchange, exchDisp)) {
      continue;
    }

    const name =
      (typeof quote?.longname === "string" && quote.longname.trim().length > 0
        ? quote.longname.trim()
        : undefined) ??
      (typeof quote?.shortname === "string" && quote.shortname.trim().length > 0
        ? quote.shortname.trim()
        : undefined) ??
      ticker;

    seen.add(ticker);
    items.push({
      ticker,
      name,
      expenseRatio: 0,
      category: toSearchCategory(quoteType)
    });

    if (items.length >= limit) {
      break;
    }
  }

  setCached(cacheKey, items, SEARCH_CACHE_TTL_MS);
  return items;
}

