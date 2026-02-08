import { clearExpiredCache } from "@/lib/cache";
import { getHistoricalSeries, searchSymbols } from "@/lib/yahoo";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("yahoo data source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearExpiredCache();
  });

  it("retries once and then returns parsed price fields", async () => {
    const payload = {
      chart: {
        result: [
          {
            timestamp: [1704153600, 1704240000],
            indicators: {
              adjclose: [{ adjclose: [100, 101] }],
              quote: [{ close: [99.5, 100.8] }]
            }
          }
        ],
        error: null
      }
    };

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getHistoricalSeries("RETRY", "2024-01-02", "2024-01-03");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].close).toBe(99.5);
    expect(result[0].adjustedClose).toBe(100);
    expect(result[0].dividendPerShare).toBe(0);
    expect(result[0].splitRatio).toBe(1);
  });

  it("parses dividend and split events", async () => {
    const payload = {
      chart: {
        result: [
          {
            timestamp: [1704153600, 1704240000],
            indicators: {
              adjclose: [{ adjclose: [100, 102] }],
              quote: [{ close: [100, 101] }]
            },
            events: {
              dividends: {
                "1704240000": {
                  amount: 0.5,
                  date: 1704240000
                }
              },
              splits: {
                "1704153600": {
                  numerator: 2,
                  denominator: 1,
                  date: 1704153600
                }
              }
            }
          }
        ],
        error: null
      }
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await getHistoricalSeries("DIV", "2024-01-02", "2024-01-03");

    expect(result[0].splitRatio).toBe(2);
    expect(result[1].dividendPerShare).toBe(0.5);
  });

  it("searches and filters US equities and ETFs", async () => {
    const payload = {
      quotes: [
        {
          symbol: "PLTR",
          quoteType: "EQUITY",
          exchange: "NMS",
          shortname: "Palantir Technologies Inc."
        },
        {
          symbol: "SOXX",
          quoteType: "ETF",
          exchange: "PCX",
          longname: "iShares Semiconductor ETF"
        },
        {
          symbol: "7203.T",
          quoteType: "EQUITY",
          exchange: "TYO",
          shortname: "Toyota Motor Corp"
        }
      ]
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const items = await searchSymbols("pltr", 10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(items.find((item) => item.ticker === "PLTR")).toBeTruthy();
    expect(items.find((item) => item.ticker === "SOXX")).toBeTruthy();
    expect(items.find((item) => item.ticker === "7203.T")).toBeFalsy();
  });
});

