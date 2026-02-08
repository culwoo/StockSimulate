import { POST } from "@/app/api/simulations/run/route";
import { getHistoricalSeries, YahooDataError } from "@/lib/yahoo";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/yahoo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/yahoo")>();
  return {
    ...actual,
    getHistoricalSeries: vi.fn()
  };
});

const mockedGetHistoricalSeries = vi.mocked(getHistoricalSeries);

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/simulations/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

const validPayload = {
  startDate: "2024-01-02",
  endDate: "2024-01-05",
  initialAmount: 10000,
  monthlySalary: 2500000,
  monthlyContribution: 300,
  minimumCashReserve: 500,
  dividendPolicy: "reinvest_same_asset",
  allocations: [
    {
      ticker: "SPY",
      targetWeight: 50,
      expenseRatio: 0.0009
    },
    {
      ticker: "QQQ",
      targetWeight: 50,
      expenseRatio: 0.002
    }
  ],
  rebalanceFrequency: "quarterly",
  contributionRule: "first_trading_day",
  benchmarkTicker: "SPY",
  riskFreeRate: 0.02
} as const;

const sampleSeries = {
  SPY: [
    { date: "2024-01-02", close: 100, adjustedClose: 100, dividendPerShare: 0, splitRatio: 1 },
    { date: "2024-01-03", close: 101, adjustedClose: 101, dividendPerShare: 0.2, splitRatio: 1 },
    { date: "2024-01-04", close: 102, adjustedClose: 102.5, dividendPerShare: 0, splitRatio: 1 },
    { date: "2024-01-05", close: 103, adjustedClose: 103.5, dividendPerShare: 0, splitRatio: 1 }
  ],
  QQQ: [
    { date: "2024-01-02", close: 200, adjustedClose: 200, dividendPerShare: 0, splitRatio: 1 },
    { date: "2024-01-03", close: 202, adjustedClose: 202, dividendPerShare: 0, splitRatio: 1 },
    { date: "2024-01-04", close: 203, adjustedClose: 203, dividendPerShare: 0, splitRatio: 1 },
    { date: "2024-01-05", close: 205, adjustedClose: 205, dividendPerShare: 0, splitRatio: 1 }
  ]
};

describe("POST /api/simulations/run", () => {
  beforeEach(() => {
    mockedGetHistoricalSeries.mockReset();
  });

  it("returns simulation result for valid payload", async () => {
    mockedGetHistoricalSeries.mockImplementation(async (ticker: string) => {
      const normalized = ticker.toUpperCase() as keyof typeof sampleSeries;
      const series = sampleSeries[normalized];
      if (!series) {
        throw new YahooDataError(`No data for ${ticker}`);
      }
      return series;
    });

    const response = await POST(buildRequest(validPayload));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.timeline.length).toBeGreaterThan(1);
    expect(body.metrics.portfolio.endingValue).toBeGreaterThan(0);
    expect(body.cashflowBreakdown.totalInvested).toBeGreaterThan(0);
  });

  it("allows a single allocation at 100%", async () => {
    mockedGetHistoricalSeries.mockImplementation(async (ticker: string) => {
      const normalized = ticker.toUpperCase() as keyof typeof sampleSeries;
      const series = sampleSeries[normalized];
      if (!series) {
        throw new YahooDataError(`No data for ${ticker}`);
      }
      return series;
    });

    const payload = {
      ...validPayload,
      allocations: [
        {
          ticker: "SPY",
          targetWeight: 100,
          expenseRatio: 0.0009
        }
      ],
      benchmarkTicker: "QQQ"
    };

    const response = await POST(buildRequest(payload));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.timeline.length).toBeGreaterThan(1);
    expect(body.metrics.portfolio.endingValue).toBeGreaterThan(0);
  });

  it("supports minimum cash reserve floor", async () => {
    mockedGetHistoricalSeries.mockImplementation(async (ticker: string) => {
      const normalized = ticker.toUpperCase() as keyof typeof sampleSeries;
      const series = sampleSeries[normalized];
      if (!series) {
        throw new YahooDataError(`No data for ${ticker}`);
      }
      return series;
    });

    const payload = {
      ...validPayload,
      minimumCashReserve: 200000,
      allocations: [
        {
          ticker: "SPY",
          targetWeight: 100,
          expenseRatio: 0.0009
        }
      ]
    };

    const response = await POST(buildRequest(payload));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.cashflowBreakdown.endingCash).toBeGreaterThanOrEqual(200000 - 0.5);
  });

  it("accepts dividend policy to_cash", async () => {
    mockedGetHistoricalSeries.mockImplementation(async (ticker: string) => {
      const normalized = ticker.toUpperCase() as keyof typeof sampleSeries;
      const series = sampleSeries[normalized];
      if (!series) {
        throw new YahooDataError(`No data for ${ticker}`);
      }
      return series;
    });

    const payload = {
      ...validPayload,
      dividendPolicy: "to_cash"
    };

    const response = await POST(buildRequest(payload));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.cashflowBreakdown.endingCash).toBeGreaterThan(0);
  });

  it("returns 400 when ticker is missing", async () => {
    const payload = {
      ...validPayload,
      allocations: [
        {
          ticker: "",
          targetWeight: 50,
          expenseRatio: 0.001
        },
        {
          ticker: "QQQ",
          targetWeight: 50,
          expenseRatio: 0.002
        }
      ]
    };

    const response = await POST(buildRequest(payload));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe("Invalid simulation request");
  });

  it("returns 400 when date range is reversed", async () => {
    const payload = {
      ...validPayload,
      startDate: "2024-02-01",
      endDate: "2024-01-01"
    };

    const response = await POST(buildRequest(payload));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(String(body.details[0].message)).toContain("endDate");
  });

  it("allows allocation sum less than 100 (cash residual)", async () => {
    mockedGetHistoricalSeries.mockImplementation(async (ticker: string) => {
      const normalized = ticker.toUpperCase() as keyof typeof sampleSeries;
      const series = sampleSeries[normalized];
      if (!series) {
        throw new YahooDataError(`No data for ${ticker}`);
      }
      return series;
    });

    const payload = {
      ...validPayload,
      allocations: [
        {
          ticker: "SPY",
          targetWeight: 40,
          expenseRatio: 0.0009
        },
        {
          ticker: "QQQ",
          targetWeight: 40,
          expenseRatio: 0.002
        }
      ]
    };

    const response = await POST(buildRequest(payload));
    expect(response.status).toBe(200);
  });

  it("returns 400 when allocation sum exceeds 100", async () => {
    const payload = {
      ...validPayload,
      allocations: [
        {
          ticker: "SPY",
          targetWeight: 60,
          expenseRatio: 0.0009
        },
        {
          ticker: "QQQ",
          targetWeight: 50,
          expenseRatio: 0.002
        }
      ]
    };

    const response = await POST(buildRequest(payload));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(String(body.details[0].message)).toContain("less than or equal to 100");
  });

  it("returns 502 when market data source fails", async () => {
    mockedGetHistoricalSeries.mockRejectedValue(new YahooDataError("upstream failure"));

    const response = await POST(buildRequest(validPayload));
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.error).toContain("Failed to fetch market data from Yahoo Finance");
  });
});

