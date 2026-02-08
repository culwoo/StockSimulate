import {
  calculateAnnualizedVolatility,
  calculateCagr,
  calculateMaxDrawdown,
  calculateTimeWeightedDailyReturns
} from "@/lib/metrics";
import { describe, expect, it } from "vitest";

describe("metrics", () => {
  it("calculates CAGR for fixed period", () => {
    const cagr = calculateCagr(100, 121, 2);
    expect(cagr).toBeCloseTo(0.1, 8);
  });

  it("calculates maximum drawdown correctly", () => {
    const mdd = calculateMaxDrawdown([100, 120, 90, 130]);
    expect(mdd).toBeCloseTo(-0.25, 8);
  });

  it("calculates annualized volatility from daily returns", () => {
    const volatility = calculateAnnualizedVolatility([0.01, -0.01, 0.01, -0.01]);
    expect(volatility).toBeCloseTo(0.1833, 3);
  });

  it("calculates time-weighted daily returns with cashflows", () => {
    const returns = calculateTimeWeightedDailyReturns([100, 110, 170], [100, 0, 50]);
    expect(returns[0]).toBeCloseTo(0.1, 8);
    expect(returns[1]).toBeCloseTo(0.090909, 6);
  });
});

