import {
  buildTradingSchedules,
  getFirstTradingDayOfMonth,
  isQuarterStartMonth
} from "@/lib/calendar";
import { describe, expect, it } from "vitest";

describe("calendar", () => {
  it("detects quarter start months", () => {
    expect(isQuarterStartMonth(0)).toBe(true);
    expect(isQuarterStartMonth(3)).toBe(true);
    expect(isQuarterStartMonth(6)).toBe(true);
    expect(isQuarterStartMonth(9)).toBe(true);
    expect(isQuarterStartMonth(11)).toBe(false);
  });

  it("finds first trading day of month", () => {
    const tradingDays = ["2024-01-03", "2024-01-04", "2024-02-01", "2024-02-02"];
    expect(getFirstTradingDayOfMonth(tradingDays, 2024, 1)).toBe("2024-02-01");
    expect(getFirstTradingDayOfMonth(tradingDays, 2024, 2)).toBeNull();
  });

  it("builds contribution and rebalance schedules from trading days", () => {
    const tradingDays = [
      "2024-01-02",
      "2024-01-03",
      "2024-02-01",
      "2024-03-01",
      "2024-04-01",
      "2024-04-02"
    ];

    const { contributionDays, rebalanceDays } = buildTradingSchedules(tradingDays);

    expect(contributionDays.has("2024-01-02")).toBe(true);
    expect(contributionDays.has("2024-02-01")).toBe(true);
    expect(contributionDays.has("2024-03-01")).toBe(true);
    expect(contributionDays.has("2024-04-01")).toBe(true);

    expect(rebalanceDays.has("2024-01-02")).toBe(true);
    expect(rebalanceDays.has("2024-04-01")).toBe(true);
    expect(rebalanceDays.has("2024-03-01")).toBe(false);
  });
});

