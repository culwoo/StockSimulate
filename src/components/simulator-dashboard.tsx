
"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { ETF_LOOKUP, ETF_UNIVERSE } from "@/lib/data/etfs";
import { clampNumber, formatCurrency, formatPercent } from "@/lib/format";
import {
  AllocationInput,
  DividendPolicy,
  EtfInfo,
  SimulationRequest,
  SimulationResult
} from "@/lib/types";

import styles from "./simulator-dashboard.module.css";

type PortfolioPanel = "my" | "compare";

type PortfolioFormState = {
  startDate: string;
  endDate: string;
  initialAmount: number;
  monthlySalary: number;
  monthlyContribution: number;
  minimumCashReserve: number;
  allocations: AllocationInput[];
};

type CompareTargetState = {
  id: string;
  portfolio: PortfolioFormState;
};

type MergedLinePoint = {
  date: string;
  baseValue: number | null;
  compareValue: number | null;
  baseInvested: number | null;
  compareInvested: number | null;
};

type MergedDrawdownPoint = {
  date: string;
  baseDrawdown: number | null;
  compareDrawdown: number | null;
};

type MergedYearPoint = {
  year: number;
  baseReturn: number | null;
  compareReturn: number | null;
};

type SearchState = {
  items: EtfInfo[];
  loading: boolean;
  error: string | null;
};

type PortfolioBaseControlsProps = {
  portfolio: PortfolioFormState;
  onChangePortfolio: (updater: (previous: PortfolioFormState) => PortfolioFormState) => void;
  disableDateEditing?: boolean;
};

type PortfolioEditorProps = {
  panel: PortfolioPanel;
  title: string;
  portfolio: PortfolioFormState;
  searchQuery: string;
  searchState: SearchState;
  onSearchChange: (value: string) => void;
  onAddTicker: (ticker: string) => void;
  onChangePortfolio: (updater: (previous: PortfolioFormState) => PortfolioFormState) => void;
  headerActions?: ReactNode;
  toolbarActions?: ReactNode;
  disableDateEditing?: boolean;
};

const DEFAULT_MONTHLY_SALARY = 2_500_000;
const DEFAULT_MINIMUM_CASH_RESERVE = 500_000;
const LIVING_COST = 1_000_000;
const MAX_COMPARE_TARGETS = 3;
const KRW_PER_MANWON = 10_000;

function isoYearsAgo(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function toNumberOrZero(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toManwon(valueInKrw: number): number {
  return Math.round((valueInKrw / KRW_PER_MANWON) * 100) / 100;
}

function toKrwFromManwonInput(raw: string): number {
  return Math.round(toNumberOrZero(raw) * KRW_PER_MANWON);
}

function roundWeight(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeTickerInput(value: string): string {
  return value.trim().toUpperCase();
}

function isValidTicker(value: string): boolean {
  return /^[A-Z0-9.-]{1,10}$/.test(value);
}

function getWeightSum(allocations: AllocationInput[]): number {
  return allocations.reduce((sum, allocation) => sum + allocation.targetWeight, 0);
}

function getCashWeight(allocations: AllocationInput[]): number {
  return Math.max(0, 100 - getWeightSum(allocations));
}

function getPortfolioComposition(portfolio: PortfolioFormState): {
  stockWeight: number;
  cashWeight: number;
  stockAmount: number;
  cashAmount: number;
} {
  const stockWeight = getWeightSum(portfolio.allocations);
  const cashWeight = getCashWeight(portfolio.allocations);
  const stockAmount = (portfolio.initialAmount * stockWeight) / 100;
  const cashAmount = Math.max(0, portfolio.initialAmount - stockAmount);

  return {
    stockWeight,
    cashWeight,
    stockAmount,
    cashAmount
  };
}

function hasAtLeastOnePositiveWeight(allocations: AllocationInput[]): boolean {
  return allocations.some((allocation) => allocation.targetWeight > 0);
}

function createAllocation(ticker: string, targetWeight: number): AllocationInput {
  const normalizedTicker = normalizeTickerInput(ticker);
  return {
    ticker: normalizedTicker,
    targetWeight,
    expenseRatio: ETF_LOOKUP[normalizedTicker]?.expenseRatio ?? 0
  };
}

function createDefaultPortfolio(
  tickers: string[],
  startDate: string,
  endDate: string,
  weights?: number[]
): PortfolioFormState {
  const validTickers = tickers.slice(0, 10).map((ticker) => normalizeTickerInput(ticker));

  const allocations = validTickers.map((ticker, index) => {
    if (weights && weights.length === validTickers.length) {
      return createAllocation(ticker, roundWeight(weights[index] ?? 0));
    }

    const equalWeight = validTickers.length > 0 ? 100 / validTickers.length : 0;
    if (index === validTickers.length - 1) {
      const assignedWeight = 100 - equalWeight * (validTickers.length - 1);
      return createAllocation(ticker, roundWeight(assignedWeight));
    }

    return createAllocation(ticker, roundWeight(equalWeight));
  });

  return {
    startDate,
    endDate,
    initialAmount: 10_000_000,
    monthlySalary: DEFAULT_MONTHLY_SALARY,
    monthlyContribution: 500_000,
    minimumCashReserve: DEFAULT_MINIMUM_CASH_RESERVE,
    allocations
  };
}

function clonePortfolio(portfolio: PortfolioFormState): PortfolioFormState {
  return {
    ...portfolio,
    allocations: portfolio.allocations.map((allocation) => ({ ...allocation }))
  };
}

function createCompareTarget(portfolio: PortfolioFormState): CompareTargetState {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    portfolio: clonePortfolio(portfolio)
  };
}

function formatDateLabel(date: string): string {
  return date.slice(2).replace(/-/g, ".");
}

function mergeGrowthData(baseResult: SimulationResult, compareResult: SimulationResult): MergedLinePoint[] {
  const merged = new Map<string, MergedLinePoint>();

  for (const point of baseResult.timeline) {
    merged.set(point.date, {
      date: point.date,
      baseValue: point.portfolioValue,
      compareValue: null,
      baseInvested: point.investedCapital,
      compareInvested: null
    });
  }

  for (const point of compareResult.timeline) {
    const existing = merged.get(point.date);
    if (existing) {
      existing.compareValue = point.portfolioValue;
      existing.compareInvested = point.investedCapital;
      continue;
    }

    merged.set(point.date, {
      date: point.date,
      baseValue: null,
      compareValue: point.portfolioValue,
      baseInvested: null,
      compareInvested: point.investedCapital
    });
  }

  return [...merged.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function mergeDrawdownData(baseResult: SimulationResult, compareResult: SimulationResult): MergedDrawdownPoint[] {
  const merged = new Map<string, MergedDrawdownPoint>();

  for (const point of baseResult.drawdown) {
    merged.set(point.date, {
      date: point.date,
      baseDrawdown: point.portfolioDrawdown,
      compareDrawdown: null
    });
  }

  for (const point of compareResult.drawdown) {
    const existing = merged.get(point.date);
    if (existing) {
      existing.compareDrawdown = point.portfolioDrawdown;
      continue;
    }

    merged.set(point.date, {
      date: point.date,
      baseDrawdown: null,
      compareDrawdown: point.portfolioDrawdown
    });
  }

  return [...merged.values()].sort((left, right) => left.date.localeCompare(right.date));
}
function mergeYearlyData(baseResult: SimulationResult, compareResult: SimulationResult): MergedYearPoint[] {
  const merged = new Map<number, MergedYearPoint>();

  for (const point of baseResult.yearlyReturns) {
    merged.set(point.year, {
      year: point.year,
      baseReturn: point.portfolioReturn,
      compareReturn: null
    });
  }

  for (const point of compareResult.yearlyReturns) {
    const existing = merged.get(point.year);
    if (existing) {
      existing.compareReturn = point.portfolioReturn;
      continue;
    }

    merged.set(point.year, {
      year: point.year,
      baseReturn: null,
      compareReturn: point.portfolioReturn
    });
  }

  return [...merged.values()].sort((left, right) => left.year - right.year);
}

function validatePortfolio(portfolio: PortfolioFormState): string | null {
  if (portfolio.startDate >= portfolio.endDate) {
    return "시작일은 종료일보다 빨라야 합니다.";
  }

  if (portfolio.minimumCashReserve < 0) {
    return "최소 현금은 0원 이상이어야 합니다.";
  }

  if (portfolio.allocations.length === 0) {
    return "최소 1개 종목이 필요합니다.";
  }

  const stockWeight = getWeightSum(portfolio.allocations);
  if (stockWeight > 100.05) {
    return "주식 비중은 100% 이하여야 합니다.";
  }

  if (!hasAtLeastOnePositiveWeight(portfolio.allocations)) {
    return "비중이 0%보다 큰 종목이 최소 1개 필요합니다.";
  }

  return null;
}

function validateBasePortfolio(portfolio: PortfolioFormState): string | null {
  const commonError = validatePortfolio(portfolio);
  if (commonError) {
    return commonError;
  }

  if (portfolio.minimumCashReserve < DEFAULT_MINIMUM_CASH_RESERVE) {
    return `최소 현금 유지는 ${formatCurrency(DEFAULT_MINIMUM_CASH_RESERVE)} 이상이어야 합니다.`;
  }

  const composition = getPortfolioComposition(portfolio);
  if (Math.abs(composition.stockWeight + composition.cashWeight - 100) > 0.05) {
    return "주식+현금 비중 합계는 100%여야 합니다.";
  }

  if (composition.cashAmount + 0.5 < DEFAULT_MINIMUM_CASH_RESERVE) {
    return `초기 현금은 최소 ${formatCurrency(DEFAULT_MINIMUM_CASH_RESERVE)} 이상이어야 합니다.`;
  }

  if (composition.cashAmount + 0.5 < portfolio.minimumCashReserve) {
    return "초기 현금은 최소 현금 유지 금액 이상이어야 합니다.";
  }

  return null;
}

function buildSimulationPayload(
  portfolio: PortfolioFormState,
  dividendPolicy: DividendPolicy,
  overrideAllocations?: AllocationInput[]
): SimulationRequest {
  const sourceAllocations = overrideAllocations ?? portfolio.allocations;
  const allocations = sourceAllocations
    .filter((allocation) => allocation.targetWeight > 0)
    .map((allocation) => ({
      ...allocation,
      ticker: normalizeTickerInput(allocation.ticker),
      targetWeight: roundWeight(allocation.targetWeight),
      expenseRatio: allocation.expenseRatio
    }));

  return {
    startDate: portfolio.startDate,
    endDate: portfolio.endDate,
    initialAmount: portfolio.initialAmount,
    monthlySalary: portfolio.monthlySalary,
    monthlyContribution: portfolio.monthlyContribution,
    minimumCashReserve: portfolio.minimumCashReserve,
    dividendPolicy,
    allocations,
    rebalanceFrequency: "quarterly",
    contributionRule: "first_trading_day",
    benchmarkTicker: "SPY",
    riskFreeRate: 0.02
  };
}

function extractApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "시뮬레이션 실행 중 오류가 발생했습니다.";
  }

  const value = (payload as { error?: unknown }).error;
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return "시뮬레이션 실행 중 오류가 발생했습니다.";
}

function useEtfSearch(query: string, selectedTickers: string[]): SearchState {
  const [state, setState] = useState<SearchState>({
    items: [],
    loading: false,
    error: null
  });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setState((previous) => ({
          ...previous,
          loading: true,
          error: null
        }));

        const response = await fetch(`/api/etfs?query=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const payload = await response.json();

        const remoteItems: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
        const exclude = new Set(selectedTickers.map((ticker) => normalizeTickerInput(ticker)));

        const items = remoteItems
          .filter((item: unknown): item is EtfInfo => {
            return (
              !!item &&
              typeof item === "object" &&
              typeof (item as { ticker?: unknown }).ticker === "string" &&
              typeof (item as { name?: unknown }).name === "string"
            );
          })
          .map((item: EtfInfo) => ({
            ticker: normalizeTickerInput(item.ticker),
            name: item.name,
            expenseRatio: typeof item.expenseRatio === "number" ? item.expenseRatio : 0,
            category: typeof item.category === "string" ? item.category : "Asset"
          }))
          .filter((item) => !exclude.has(item.ticker))
          .slice(0, 15);

        setState({
          items,
          loading: false,
          error: null
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const normalizedQuery = normalizeTickerInput(query);
        const localFallback = ETF_UNIVERSE.filter((etf) => {
          if (selectedTickers.includes(etf.ticker)) {
            return false;
          }

          if (!normalizedQuery) {
            return true;
          }

          return (
            etf.ticker.includes(normalizedQuery) ||
            etf.name.toUpperCase().includes(normalizedQuery)
          );
        }).slice(0, 15);

        setState({
          items: localFallback,
          loading: false,
          error: error instanceof Error ? error.message : "종목 검색 실패"
        });
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query, selectedTickers]);

  return state;
}
function PortfolioBaseControls({
  portfolio,
  onChangePortfolio,
  disableDateEditing = false
}: PortfolioBaseControlsProps) {
  return (
    <>
      <div className={styles.controlGrid}>
        <label className={`${styles.control} ${disableDateEditing ? styles.syncedDateControl : ""}`}>
          <span>시작일</span>
          <input
            type="date"
            value={portfolio.startDate}
            disabled={disableDateEditing}
            onChange={(event) =>
              onChangePortfolio((previous) => ({
                ...previous,
                startDate: event.target.value
              }))
            }
          />
        </label>

        <label className={`${styles.control} ${disableDateEditing ? styles.syncedDateControl : ""}`}>
          <span>종료일</span>
          <input
            type="date"
            value={portfolio.endDate}
            disabled={disableDateEditing}
            onChange={(event) =>
              onChangePortfolio((previous) => ({
                ...previous,
                endDate: event.target.value
              }))
            }
          />
        </label>

        <label className={styles.control}>
          <span>초기 투자금 (만원)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={toManwon(portfolio.initialAmount)}
            onChange={(event) =>
              onChangePortfolio((previous) => ({
                ...previous,
                initialAmount: Math.max(0, toKrwFromManwonInput(event.target.value))
              }))
            }
          />
        </label>

        <label className={styles.control}>
          <span>월급 (만원)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={toManwon(portfolio.monthlySalary)}
            onChange={(event) =>
              onChangePortfolio((previous) => ({
                ...previous,
                monthlySalary: Math.max(0, toKrwFromManwonInput(event.target.value))
              }))
            }
          />
        </label>

        <label className={styles.control}>
          <span>월 적립금 (만원)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={toManwon(portfolio.monthlyContribution)}
            onChange={(event) =>
              onChangePortfolio((previous) => ({
                ...previous,
                monthlyContribution: Math.max(0, toKrwFromManwonInput(event.target.value))
              }))
            }
          />
        </label>

        <label className={styles.control}>
          <span>최소 현금 유지 (만원)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={toManwon(portfolio.minimumCashReserve)}
            onChange={(event) =>
              onChangePortfolio((previous) => ({
                ...previous,
                minimumCashReserve: Math.max(0, toKrwFromManwonInput(event.target.value))
              }))
            }
          />
        </label>
      </div>

      <small className={styles.mutedText}>
        생활비는 월 {formatCurrency(LIVING_COST)}로 고정 차감되며, 현금은 최소 {formatCurrency(portfolio.minimumCashReserve)} 유지합니다.
      </small>
    </>
  );
}

function PortfolioEditor({
  panel,
  title,
  portfolio,
  searchQuery,
  searchState,
  onSearchChange,
  onAddTicker,
  onChangePortfolio,
  headerActions,
  toolbarActions,
  disableDateEditing = false
}: PortfolioEditorProps) {
  const composition = getPortfolioComposition(portfolio);
  const searchTestId = panel === "my" ? "etf-search" : "etf-search-compare";
  const searchDisclosureTestId = panel === "my" ? "toggle-etf-picker" : "toggle-etf-picker-compare";

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <h2>{title}</h2>
        {headerActions}
      </div>
      {toolbarActions ? <div className={styles.compareToolbar}>{toolbarActions}</div> : null}

      <PortfolioBaseControls
        portfolio={portfolio}
        onChangePortfolio={onChangePortfolio}
        disableDateEditing={disableDateEditing}
      />

      <details className={styles.etfDisclosure}>
        <summary className={styles.disclosureSummary} data-testid={searchDisclosureTestId}>
          <span>종목 검색/추가</span>
          <span className={styles.disclosureHint}>펼쳐보기</span>
        </summary>

        <div className={styles.etfPicker}>
          <label className={styles.control}>
            <div className={styles.searchInputRow}>
              <input
                data-testid={searchTestId}
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="예: QQQ, BRK-B, PLTR, 팔란티어, 나스닥, 반도체"
              />
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => onAddTicker(searchQuery)}
              >
                직접 추가
              </button>
            </div>
          </label>

          <div className={styles.searchStatusRow}>
            {searchState.loading ? <small className={styles.mutedText}>검색 중...</small> : null}
            {searchState.error ? <small className={styles.errorText}>검색 오류: {searchState.error}</small> : null}
          </div>

          <div className={styles.searchList}>
            {searchState.items.length === 0 ? (
              <small className={styles.mutedText}>검색 결과가 없습니다. 티커를 직접 입력해 추가할 수 있습니다.</small>
            ) : (
              searchState.items.map((item) => (
                <button
                  key={`${panel}-chip-${item.ticker}`}
                  type="button"
                  onClick={() => onAddTicker(item.ticker)}
                  className={styles.searchChip}
                >
                  <strong>{item.ticker}</strong>
                  <small>{item.name}</small>
                </button>
              ))
            )}
          </div>
        </div>
      </details>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>티커</th>
              <th>비중(%)</th>
              <th>초기 배분금액(만원)</th>
              <th>연보수</th>
              <th>동작</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.allocations.map((allocation) => {
              const amount = (portfolio.initialAmount * allocation.targetWeight) / 100;
              const tickerName = ETF_LOOKUP[allocation.ticker]?.name ?? allocation.ticker;
              const weightTestId =
                panel === "my" ? `weight-${allocation.ticker}` : `weight-compare-${allocation.ticker}`;

              return (
                <tr key={`${panel}-${allocation.ticker}`}>
                  <td>
                    <span
                      className={styles.tickerWithTooltip}
                      data-tooltip={tickerName}
                      title={tickerName}
                      tabIndex={0}
                      aria-label={`${allocation.ticker}: ${tickerName}`}
                    >
                      {allocation.ticker}
                    </span>
                  </td>
                  <td>
                    <input
                      data-testid={weightTestId}
                      className={styles.inlineInput}
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={allocation.targetWeight}
                      onChange={(event) => {
                        const nextWeight = clampNumber(toNumberOrZero(event.target.value), 0, 100);
                        onChangePortfolio((previous) => ({
                          ...previous,
                          allocations: previous.allocations.map((item) =>
                            item.ticker === allocation.ticker
                              ? {
                                  ...item,
                                  targetWeight: roundWeight(nextWeight)
                                }
                              : item
                          )
                        }));
                      }}
                    />
                  </td>
                  <td>{formatCurrency(amount)}</td>
                  <td>{formatPercent(allocation.expenseRatio)}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.smallButton}
                      disabled={portfolio.allocations.length <= 1}
                      onClick={() =>
                        onChangePortfolio((previous) => ({
                          ...previous,
                          allocations:
                            previous.allocations.length <= 1
                              ? previous.allocations
                              : previous.allocations.filter((item) => item.ticker !== allocation.ticker)
                        }))
                      }
                    >
                      제거
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.allocationSummary}>
        <p>
          <strong>주식 비중</strong> {composition.stockWeight.toFixed(2)}% ({formatCurrency(composition.stockAmount)})
        </p>
        <p>
          <strong>현금 비중</strong> {composition.cashWeight.toFixed(2)}% ({formatCurrency(composition.cashAmount)})
        </p>
      </div>
    </section>
  );
}

function getCompareTargetLabel(_target: CompareTargetState, index: number): string {
  return `비교 포트폴리오 ${index + 1}`;
}

export default function SimulatorDashboard() {
  const today = new Date().toISOString().slice(0, 10);

  const defaultBasePortfolio = useMemo(
    () => createDefaultPortfolio(["SPY", "QQQ"], isoYearsAgo(5), today, [47.5, 47.5]),
    [today]
  );
  const defaultComparePortfolio = useMemo(
    () => createDefaultPortfolio(["QQQ"], isoYearsAgo(5), today, [100]),
    [today]
  );

  const [basePortfolio, setBasePortfolio] = useState<PortfolioFormState>(() => defaultBasePortfolio);
  const [compareTargets, setCompareTargets] = useState<CompareTargetState[]>(() => [
    createCompareTarget(defaultComparePortfolio)
  ]);
  const [activeCompareIndex, setActiveCompareIndex] = useState(0);

  const [baseSearchQuery, setBaseSearchQuery] = useState("");
  const [compareSearchQuery, setCompareSearchQuery] = useState("");

  const [baseResult, setBaseResult] = useState<SimulationResult | null>(null);
  const [compareResults, setCompareResults] = useState<SimulationResult[]>([]);

  const [dividendPolicy, setDividendPolicy] = useState<DividendPolicy>("reinvest_same_asset");
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fallbackCompareTarget = useMemo(
    () => createCompareTarget(defaultComparePortfolio),
    [defaultComparePortfolio]
  );

  const activeCompareTarget =
    compareTargets[activeCompareIndex] ?? compareTargets[0] ?? fallbackCompareTarget;
  const activeCompareResult = compareResults[activeCompareIndex] ?? null;

  useEffect(() => {
    if (compareTargets.length === 0) {
      setCompareTargets([createCompareTarget(defaultComparePortfolio)]);
      setActiveCompareIndex(0);
      return;
    }

    if (activeCompareIndex > compareTargets.length - 1) {
      setActiveCompareIndex(Math.max(0, compareTargets.length - 1));
    }
  }, [activeCompareIndex, compareTargets.length, defaultComparePortfolio]);

  useEffect(() => {
    setCompareTargets((previous) => {
      let changed = false;
      const next = previous.map((target) => {
        if (
          target.portfolio.startDate === basePortfolio.startDate &&
          target.portfolio.endDate === basePortfolio.endDate
        ) {
          return target;
        }

        changed = true;
        return {
          ...target,
          portfolio: {
            ...target.portfolio,
            startDate: basePortfolio.startDate,
            endDate: basePortfolio.endDate
          }
        };
      });

      return changed ? next : previous;
    });
  }, [basePortfolio.startDate, basePortfolio.endDate]);
  const baseSelectedTickers = useMemo(
    () => basePortfolio.allocations.map((allocation) => allocation.ticker),
    [basePortfolio.allocations]
  );

  const compareSelectedTickers = useMemo(
    () => activeCompareTarget.portfolio.allocations.map((allocation) => allocation.ticker),
    [activeCompareTarget]
  );

  const baseSearchState = useEtfSearch(baseSearchQuery, baseSelectedTickers);
  const compareSearchState = useEtfSearch(compareSearchQuery, compareSelectedTickers);

  const updateActiveCompareTarget = (updater: (previous: CompareTargetState) => CompareTargetState) => {
    setCompareTargets((previous) =>
      previous.map((target, index) => {
        if (index !== activeCompareIndex) {
          return target;
        }

        return updater(target);
      })
    );
  };

  const updateActiveComparePortfolio = (
    updater: (previous: PortfolioFormState) => PortfolioFormState
  ) => {
    updateActiveCompareTarget((previous) => ({
      ...previous,
      portfolio: updater(previous.portfolio)
    }));
  };

  const addTickerToBase = (rawTicker: string) => {
    const ticker = normalizeTickerInput(rawTicker);
    if (!isValidTicker(ticker)) {
      setErrorMessage("유효한 미국 티커를 입력해 주세요. (예: PLTR, RKLB, SOXX)");
      return;
    }

    setErrorMessage(null);
    setBasePortfolio((previous) => {
      if (previous.allocations.some((allocation) => allocation.ticker === ticker)) {
        return previous;
      }

      return {
        ...previous,
        allocations: [...previous.allocations, createAllocation(ticker, 0)].slice(0, 10)
      };
    });
  };

  const addTickerToCompare = (rawTicker: string) => {
    const ticker = normalizeTickerInput(rawTicker);
    if (!isValidTicker(ticker)) {
      setErrorMessage("유효한 미국 티커를 입력해 주세요. (예: PLTR, RKLB, SOXX)");
      return;
    }

    setErrorMessage(null);

    updateActiveComparePortfolio((previous) => {
      if (previous.allocations.some((allocation) => allocation.ticker === ticker)) {
        return previous;
      }

      return {
        ...previous,
        allocations: [...previous.allocations, createAllocation(ticker, 0)].slice(0, 10)
      };
    });
  };

  const addCompareTarget = () => {
    if (compareTargets.length >= MAX_COMPARE_TARGETS) {
      return;
    }

    const syncedBasePortfolio = {
      ...basePortfolio,
      startDate: basePortfolio.startDate,
      endDate: basePortfolio.endDate
    };
    setErrorMessage(null);
    setCompareTargets((previous) => [...previous, createCompareTarget(syncedBasePortfolio)].slice(0, MAX_COMPARE_TARGETS));
    setActiveCompareIndex(compareTargets.length);
  };

  const removeActiveCompareTarget = () => {
    if (compareTargets.length <= 1) {
      return;
    }

    setCompareTargets((previous) => previous.filter((_, index) => index !== activeCompareIndex));
    setCompareResults((previous) => previous.filter((_, index) => index !== activeCompareIndex));
    setActiveCompareIndex((previous) => Math.max(0, previous - 1));
  };

  const moveCompareIndex = (direction: "prev" | "next") => {
    if (compareTargets.length <= 1) {
      return;
    }

    setActiveCompareIndex((previous) => {
      if (direction === "prev") {
        return previous === 0 ? compareTargets.length - 1 : previous - 1;
      }

      return previous === compareTargets.length - 1 ? 0 : previous + 1;
    });
  };

  const runSimulation = async () => {
    const baseError = validateBasePortfolio(basePortfolio);
    if (baseError) {
      setErrorMessage(`나의 포트폴리오: ${baseError}`);
      return;
    }

    for (let index = 0; index < compareTargets.length; index += 1) {
      const target = compareTargets[index];
      const compareError = validatePortfolio(target.portfolio);
      if (compareError) {
        setErrorMessage(`${getCompareTargetLabel(target, index)}: ${compareError}`);
        return;
      }
    }

    setErrorMessage(null);
    setIsRunning(true);

    try {
      const basePayload = buildSimulationPayload(basePortfolio, dividendPolicy);

      const comparePayloads = compareTargets.map((target) =>
        buildSimulationPayload(target.portfolio, dividendPolicy)
      );

      const payloads = [basePayload, ...comparePayloads];

      const responses = await Promise.all(
        payloads.map((payload) =>
          fetch("/api/simulations/run", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          })
        )
      );

      const bodies = await Promise.all(responses.map((response) => response.json()));

      responses.forEach((response, index) => {
        if (!response.ok) {
          if (index === 0) {
            throw new Error(`나의 포트폴리오 실행 실패: ${extractApiError(bodies[index])}`);
          }

          const target = compareTargets[index - 1];
          const label = target
            ? getCompareTargetLabel(target, index - 1)
            : `비교 포트폴리오 ${index}`;
          throw new Error(`${label} 실행 실패: ${extractApiError(bodies[index])}`);
        }
      });

      setBaseResult(bodies[0] as SimulationResult);
      setCompareResults(bodies.slice(1) as SimulationResult[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "시뮬레이션 실행 중 오류가 발생했습니다.");
    } finally {
      setIsRunning(false);
    }
  };

  const growthChartData = useMemo(() => {
    if (!baseResult || !activeCompareResult) {
      return [] as MergedLinePoint[];
    }

    return mergeGrowthData(baseResult, activeCompareResult);
  }, [baseResult, activeCompareResult]);

  const drawdownData = useMemo(() => {
    if (!baseResult || !activeCompareResult) {
      return [] as MergedDrawdownPoint[];
    }

    return mergeDrawdownData(baseResult, activeCompareResult);
  }, [baseResult, activeCompareResult]);

  const yearlyData = useMemo(() => {
    if (!baseResult || !activeCompareResult) {
      return [] as MergedYearPoint[];
    }

    return mergeYearlyData(baseResult, activeCompareResult);
  }, [baseResult, activeCompareResult]);

  const cagrData = useMemo(() => {
    if (!baseResult || !activeCompareResult) {
      return [] as Array<{ label: string; base: number; compare: number }>;
    }

    return [
      {
        label: "원금기준 CAGR",
        base: baseResult.metrics.portfolio.contributionAdjustedCagr,
        compare: activeCompareResult.metrics.portfolio.contributionAdjustedCagr
      },
      {
        label: "성장 CAGR",
        base: baseResult.metrics.portfolio.growthCagr,
        compare: activeCompareResult.metrics.portfolio.growthCagr
      },
      {
        label: "누적 수익률",
        base: baseResult.metrics.portfolio.cumulativeReturn,
        compare: activeCompareResult.metrics.portfolio.cumulativeReturn
      }
    ];
  }, [baseResult, activeCompareResult]);

  const endingComposition = useMemo(() => {
    if (!baseResult || !activeCompareResult) {
      return [] as Array<{ label: string; base: number; compare: number }>;
    }

    return [
      {
        label: "주식",
        base: baseResult.cashflowBreakdown.endingStockValue,
        compare: activeCompareResult.cashflowBreakdown.endingStockValue
      },
      {
        label: "현금",
        base: baseResult.cashflowBreakdown.endingCash,
        compare: activeCompareResult.cashflowBreakdown.endingCash
      },
      {
        label: "수익",
        base: baseResult.cashflowBreakdown.gains,
        compare: activeCompareResult.cashflowBreakdown.gains
      }
    ];
  }, [baseResult, activeCompareResult]);

  const activeCompareLabel = getCompareTargetLabel(activeCompareTarget, activeCompareIndex);
  const comparePager = (
    <div className={styles.comparePager}>
      <button
        type="button"
        className={`${styles.smallButton} ${styles.pagerNavButton}`}
        onClick={() => moveCompareIndex("prev")}
        aria-label="이전 비교 포트폴리오"
      >
        {"<"}
      </button>
      <button
        data-testid="remove-compare-btn"
        type="button"
        className={`${styles.smallButton} ${styles.pagerSlotButton}`}
        disabled={compareTargets.length <= 1}
        onClick={removeActiveCompareTarget}
        aria-label="비교 포트폴리오 삭제"
      >
        -
      </button>
      <strong className={styles.comparePagerLabel}>{`(${activeCompareIndex + 1}/${compareTargets.length})`}</strong>
      <button
        data-testid="add-compare-btn"
        type="button"
        className={`${styles.smallButton} ${styles.pagerSlotButton}`}
        disabled={compareTargets.length >= MAX_COMPARE_TARGETS}
        onClick={addCompareTarget}
      >
        +
      </button>
      <button
        type="button"
        className={`${styles.smallButton} ${styles.pagerNavButton}`}
        onClick={() => moveCompareIndex("next")}
        aria-label="다음 비교 포트폴리오"
      >
        {">"}
      </button>
    </div>
  );

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.kicker}>KRW 기준 백테스트</span>
        <h1>미국 주식/ETF 포트폴리오 시뮬레이터</h1>
        <p>
          미국 전체 티커 검색과 직접 입력, 한글 별칭 검색을 지원합니다. 월급/생활비/적립금 현금흐름과 배당 정책,
          최소 현금 유지 규칙을 반영해 비교 백테스트를 제공합니다.
        </p>
      </section>

      <div className={styles.dualColumn}>
        <PortfolioEditor
          panel="my"
          title="나의 포트폴리오"
          portfolio={basePortfolio}
          searchQuery={baseSearchQuery}
          searchState={baseSearchState}
          onSearchChange={setBaseSearchQuery}
          onAddTicker={addTickerToBase}
          onChangePortfolio={(updater) => setBasePortfolio((previous) => updater(previous))}
          headerActions={<div className={styles.comparePagerGhost} aria-hidden="true" />}
        />

        <PortfolioEditor
          panel="compare"
          title="비교 포트폴리오"
          portfolio={activeCompareTarget.portfolio}
          searchQuery={compareSearchQuery}
          searchState={compareSearchState}
          onSearchChange={setCompareSearchQuery}
          onAddTicker={addTickerToCompare}
          onChangePortfolio={updateActiveComparePortfolio}
          headerActions={comparePager}
          disableDateEditing
        />
      </div>

      <section className={styles.card}>
        <div className={styles.actionRow}>
          <button
            data-testid="run-simulation-btn"
            type="button"
            className={styles.primaryButton}
            onClick={runSimulation}
            disabled={isRunning}
          >
            {isRunning ? "비교 계산 중..." : "비교 실행"}
          </button>

          <div className={styles.optionControls}>
            <label className={styles.controlInline}>
              <span>배당 처리</span>
              <select
                data-testid="dividend-policy-select"
                value={dividendPolicy}
                onChange={(event) => setDividendPolicy(event.target.value as DividendPolicy)}
              >
                <option value="reinvest_same_asset">동일 종목 즉시 재투자</option>
                <option value="to_cash">현금 보유</option>
              </select>
            </label>
          </div>
        </div>

        {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}
      </section>

      {baseResult && activeCompareResult ? (
        <section className={styles.card} data-testid="simulation-results">
          <div className={styles.sectionHeader}>
            <h2>시뮬레이션 결과</h2>
            <small className={styles.mutedText}>{`나의 포트폴리오 vs ${activeCompareLabel}`}</small>
          </div>

          <div className={styles.metricGrid}>
            <article>
              <h3>최종 자산</h3>
              <p>{formatCurrency(baseResult.metrics.portfolio.endingValue)}</p>
              <small className={styles.mutedText}>나의 포트폴리오</small>
              <p>{formatCurrency(activeCompareResult.metrics.portfolio.endingValue)}</p>
              <small className={styles.mutedText}>{activeCompareLabel}</small>
            </article>

            <article>
              <h3>총 투자원금</h3>
              <p>{formatCurrency(baseResult.metrics.portfolio.totalInvested)}</p>
              <small className={styles.mutedText}>나의 포트폴리오</small>
              <p>{formatCurrency(activeCompareResult.metrics.portfolio.totalInvested)}</p>
              <small className={styles.mutedText}>{activeCompareLabel}</small>
            </article>

            <article>
              <h3>누적 수익</h3>
              <p>{formatCurrency(baseResult.metrics.portfolio.gains)}</p>
              <small className={styles.mutedText}>나의 포트폴리오</small>
              <p>{formatCurrency(activeCompareResult.metrics.portfolio.gains)}</p>
              <small className={styles.mutedText}>{activeCompareLabel}</small>
            </article>

            <article>
              <h3>최종 현금</h3>
              <p>{formatCurrency(baseResult.cashflowBreakdown.endingCash)}</p>
              <small className={styles.mutedText}>나의 포트폴리오</small>
              <p>{formatCurrency(activeCompareResult.cashflowBreakdown.endingCash)}</p>
              <small className={styles.mutedText}>{activeCompareLabel}</small>
            </article>
          </div>

          <div className={styles.chartGrid}>
            <article className={styles.chartCard} data-testid="growth-chart">
              <h3>총 자산 곡선</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={growthChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} minTickGap={20} />
                  <YAxis tickFormatter={(value) => formatCurrency(Number(value))} width={100} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0))}
                    labelFormatter={(value) => `날짜 ${value}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="baseValue" name="나의 포트폴리오" stroke="#2774AE" dot={false} strokeWidth={2.5} />
                  <Line type="monotone" dataKey="compareValue" name={activeCompareLabel} stroke="#008B8B" dot={false} strokeWidth={2.5} />
                  <Line type="monotone" dataKey="baseInvested" name="나의 투입원금" stroke="#86BBE4" dot={false} strokeWidth={1.5} strokeDasharray="5 3" />
                  <Line type="monotone" dataKey="compareInvested" name="비교 투입원금" stroke="#45FFFF" dot={false} strokeWidth={1.5} strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            </article>
            <article className={styles.chartCard}>
              <h3>낙폭(Drawdown) 곡선</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={drawdownData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} minTickGap={20} />
                  <YAxis tickFormatter={(value) => formatPercent(Number(value))} width={90} />
                  <Tooltip formatter={(value) => formatPercent(Number(value ?? 0))} />
                  <Legend />
                  <Line type="monotone" dataKey="baseDrawdown" name="나의 포트폴리오" stroke="#2774AE" dot={false} strokeWidth={2.5} />
                  <Line type="monotone" dataKey="compareDrawdown" name={activeCompareLabel} stroke="#008B8B" dot={false} strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </article>

            <article className={styles.chartCard}>
              <h3>연도별 수익률</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => formatPercent(Number(value))} width={90} />
                  <Tooltip formatter={(value) => formatPercent(Number(value ?? 0))} />
                  <Legend />
                  <Bar dataKey="baseReturn" name="나의 포트폴리오" fill="#2774AE" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="compareReturn" name={activeCompareLabel} fill="#008B8B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </article>

            <article className={styles.chartCard}>
              <h3>연평균 수익률(CAGR) 그래프</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={cagrData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => formatPercent(Number(value))} width={90} />
                  <Tooltip formatter={(value) => formatPercent(Number(value ?? 0))} />
                  <Legend />
                  <Bar dataKey="base" name="나의 포트폴리오" fill="#2774AE" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="compare" name={activeCompareLabel} fill="#008B8B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </article>

            <article className={styles.chartCard}>
              <h3>주식/현금/수익 분해</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={endingComposition}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value) => formatCurrency(Number(value))} width={100} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                  <Legend />
                  <Bar dataKey="base" name="나의 포트폴리오" fill="#2774AE" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="compare" name={activeCompareLabel} fill="#008B8B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </article>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>비교 대상</th>
                  <th>타입</th>
                  <th>최종자산</th>
                  <th>누적수익</th>
                  <th>원금기준 CAGR</th>
                  <th>성장 CAGR</th>
                  <th>MDD</th>
                  <th>변동성</th>
                  <th>샤프</th>
                </tr>
              </thead>
              <tbody>
                <tr className={styles.highlightRow}>
                  <td>나의 포트폴리오</td>
                  <td>base</td>
                  <td>{formatCurrency(baseResult.metrics.portfolio.endingValue)}</td>
                  <td>{formatCurrency(baseResult.metrics.portfolio.gains)}</td>
                  <td>{formatPercent(baseResult.metrics.portfolio.contributionAdjustedCagr)}</td>
                  <td>{formatPercent(baseResult.metrics.portfolio.growthCagr)}</td>
                  <td>{formatPercent(baseResult.metrics.portfolio.maxDrawdown)}</td>
                  <td>{formatPercent(baseResult.metrics.portfolio.annualizedVolatility)}</td>
                  <td>{baseResult.metrics.portfolio.sharpeRatio.toFixed(2)}</td>
                </tr>
                {compareResults.map((result, index) => {
                  const target = compareTargets[index] ?? fallbackCompareTarget;
                  const label = getCompareTargetLabel(target, index);
                  return (
                    <tr key={`summary-${index}`} className={index === activeCompareIndex ? styles.highlightRow : undefined}>
                      <td>{label}</td>
                      <td>portfolio</td>
                      <td>{formatCurrency(result.metrics.portfolio.endingValue)}</td>
                      <td>{formatCurrency(result.metrics.portfolio.gains)}</td>
                      <td>{formatPercent(result.metrics.portfolio.contributionAdjustedCagr)}</td>
                      <td>{formatPercent(result.metrics.portfolio.growthCagr)}</td>
                      <td>{formatPercent(result.metrics.portfolio.maxDrawdown)}</td>
                      <td>{formatPercent(result.metrics.portfolio.annualizedVolatility)}</td>
                      <td>{result.metrics.portfolio.sharpeRatio.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

