import { GET } from "@/app/api/etfs/route";
import { searchSymbols, YahooDataError } from "@/lib/yahoo";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/yahoo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/yahoo")>();
  return {
    ...actual,
    searchSymbols: vi.fn()
  };
});

const mockedSearchSymbols = vi.mocked(searchSymbols);

describe("GET /api/etfs", () => {
  beforeEach(() => {
    mockedSearchSymbols.mockReset();
  });

  it("returns seed list when query is empty", async () => {
    const request = new Request("http://localhost/api/etfs");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBeGreaterThan(0);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("merges local and yahoo search results", async () => {
    mockedSearchSymbols.mockResolvedValue([
      {
        ticker: "PLTR",
        name: "Palantir Technologies Inc.",
        expenseRatio: 0,
        category: "Stock"
      },
      {
        ticker: "SOXX",
        name: "iShares Semiconductor ETF",
        expenseRatio: 0,
        category: "ETF"
      }
    ]);

    const request = new Request("http://localhost/api/etfs?query=PLTR");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.find((item: { ticker: string }) => item.ticker === "PLTR")).toBeTruthy();
  });

  it("resolves Korean alias query without calling Yahoo with Hangul", async () => {
    mockedSearchSymbols.mockResolvedValue([
      {
        ticker: "PLTR",
        name: "Palantir Technologies Inc.",
        expenseRatio: 0,
        category: "Stock"
      }
    ]);

    const request = new Request("http://localhost/api/etfs?query=팔란티어");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.find((item: { ticker: string }) => item.ticker === "PLTR")).toBeTruthy();

    const calledTerms = mockedSearchSymbols.mock.calls.map(([term]) => term);
    expect(calledTerms.some((term) => term.toUpperCase() === "PLTR")).toBe(true);
  });

  it("falls back to local matches when yahoo search fails", async () => {
    mockedSearchSymbols.mockRejectedValue(new YahooDataError("upstream failed"));

    const request = new Request("http://localhost/api/etfs?query=QQQ");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBeGreaterThan(0);
  });
});

