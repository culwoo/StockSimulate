import { expect, test, type Page } from "@playwright/test";

const mockedEtfList = {
  query: "",
  count: 8,
  items: [
    { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", expenseRatio: 0.0009, category: "ETF" },
    { ticker: "QQQ", name: "Invesco QQQ Trust", expenseRatio: 0.002, category: "ETF" },
    { ticker: "SOXX", name: "iShares Semiconductor ETF", expenseRatio: 0.0035, category: "ETF" },
    { ticker: "PLTR", name: "Palantir Technologies Inc.", expenseRatio: 0, category: "Stock" },
    { ticker: "RKLB", name: "Rocket Lab USA, Inc.", expenseRatio: 0, category: "Stock" },
    { ticker: "BRK-B", name: "Berkshire Hathaway Inc.", expenseRatio: 0, category: "Stock" },
    { ticker: "AAPL", name: "Apple Inc.", expenseRatio: 0, category: "Stock" },
    { ticker: "MSFT", name: "Microsoft Corporation", expenseRatio: 0, category: "Stock" }
  ]
};

const mockedSimulationResult = {
  timeline: [
    {
      date: "2024-01-02",
      stockValue: 8000,
      cashValue: 2000,
      portfolioValue: 10000,
      benchmarkValue: 10000,
      investedCapital: 10000,
      netFlow: 10000
    },
    {
      date: "2024-02-01",
      stockValue: 8600,
      cashValue: 2400,
      portfolioValue: 11000,
      benchmarkValue: 10850,
      investedCapital: 11500,
      netFlow: 1500
    },
    {
      date: "2024-03-01",
      stockValue: 9500,
      cashValue: 2800,
      portfolioValue: 12300,
      benchmarkValue: 11820,
      investedCapital: 13000,
      netFlow: 1500
    }
  ],
  metrics: {
    portfolio: {
      endingValue: 12300,
      totalInvested: 13000,
      gains: -700,
      cumulativeReturn: -0.0538,
      contributionAdjustedCagr: -0.1,
      growthCagr: 0.08,
      maxDrawdown: -0.04,
      annualizedVolatility: 0.13,
      sharpeRatio: 0.45
    },
    benchmark: {
      endingValue: 11820,
      totalInvested: 13000,
      gains: -1180,
      cumulativeReturn: -0.0908,
      contributionAdjustedCagr: -0.14,
      growthCagr: 0.04,
      maxDrawdown: -0.06,
      annualizedVolatility: 0.11,
      sharpeRatio: 0.2
    }
  },
  yearlyReturns: [
    {
      year: 2024,
      portfolioReturn: 0.1,
      benchmarkReturn: 0.08
    }
  ],
  drawdown: [
    {
      date: "2024-01-02",
      portfolioDrawdown: 0,
      benchmarkDrawdown: 0
    },
    {
      date: "2024-02-01",
      portfolioDrawdown: -0.02,
      benchmarkDrawdown: -0.03
    },
    {
      date: "2024-03-01",
      portfolioDrawdown: -0.01,
      benchmarkDrawdown: -0.025
    }
  ],
  cashflowBreakdown: {
    initialPrincipal: 10000,
    contributions: 3000,
    totalInvested: 13000,
    gains: -700,
    endingCash: 2800,
    endingStockValue: 9500
  }
};

type MockApiOptions = {
  onSimulationRun?: () => void;
};

async function mockApi(page: Page, options: MockApiOptions = {}): Promise<void> {
  await page.route("**/api/etfs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockedEtfList)
    });
  });

  await page.route("**/api/simulations/run", async (route) => {
    options.onSimulationRun?.();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockedSimulationResult)
    });
  });
}

test("runs simulation and renders charts", async ({ page }) => {
  await mockApi(page);

  await page.goto("/");
  await expect(page.getByTestId("run-simulation-btn")).toBeVisible();

  await page.getByTestId("run-simulation-btn").click();
  await expect(page.getByTestId("simulation-results")).toBeVisible();
  await expect(page.getByTestId("growth-chart")).toBeVisible();
});

test("default compare portfolio is qqq 100", async ({ page }) => {
  await mockApi(page);

  await page.goto("/");
  await expect(page.getByTestId("weight-compare-QQQ")).toHaveValue("100");
  await expect(page.getByTestId("weight-compare-SPY")).toHaveCount(0);
});

test("default my portfolio keeps 500k cash with SPY/QQQ split", async ({ page }) => {
  await mockApi(page);

  await page.goto("/");
  await expect(page.getByTestId("weight-SPY")).toHaveValue("47.5");
  await expect(page.getByTestId("weight-QQQ")).toHaveValue("47.5");
  await expect(page.getByTestId("weight-SOXX")).toHaveCount(0);
});

test("adds additional compare portfolio", async ({ page }) => {
  await mockApi(page);

  await page.goto("/");
  await expect(page.getByTestId("add-compare-btn")).toBeVisible();
  await page.getByTestId("weight-SPY").fill("60");
  await page.getByTestId("weight-QQQ").fill("35");

  await page.getByTestId("add-compare-btn").click();
  await expect(page.getByText("(2/2)")).toBeVisible();
  await expect(page.getByTestId("weight-compare-SPY")).toHaveValue("60");
  await expect(page.getByTestId("weight-compare-QQQ")).toHaveValue("35");
});

test("uses pager add control without benchmark toggle", async ({ page }) => {
  await mockApi(page);

  await page.goto("/");
  await expect(page.getByTestId("add-compare-btn")).toBeVisible();
  await expect(page.getByTestId("remove-compare-btn")).toBeVisible();
  await expect(page.getByTestId("compare-type-benchmark")).toHaveCount(0);
});

test("removes compare slot from pager minus button", async ({ page }) => {
  await mockApi(page);

  await page.goto("/");
  await page.getByTestId("add-compare-btn").click();
  await expect(page.getByText("(2/2)")).toBeVisible();

  await page.getByTestId("remove-compare-btn").click();
  await expect(page.getByText("(1/1)")).toBeVisible();
});

test("locks compare dates to my portfolio dates", async ({ page }) => {
  await mockApi(page);

  await page.goto("/");

  const cards = page.locator("section").filter({
    has: page.locator("h2")
  });
  const myCard = cards.filter({ has: page.getByRole("heading", { name: "나의 포트폴리오" }) }).first();
  const compareCard = cards.filter({ has: page.getByRole("heading", { name: "비교 포트폴리오" }) }).first();

  await expect(compareCard.locator('input[type="date"]').nth(0)).toBeDisabled();
  await expect(compareCard.locator('input[type="date"]').nth(1)).toBeDisabled();

  await myCard.locator('input[type="date"]').nth(0).fill("2021-01-04");
  await expect(compareCard.locator('input[type="date"]').nth(0)).toHaveValue("2021-01-04");
});

test("blocks simulation when my portfolio initial cash is below 500k", async ({ page }) => {
  let simulationCallCount = 0;
  await mockApi(page, {
    onSimulationRun: () => {
      simulationCallCount += 1;
    }
  });

  await page.goto("/");
  await page.getByTestId("weight-SPY").fill("100");
  await page.getByTestId("weight-QQQ").fill("0");
  await page.getByTestId("run-simulation-btn").click();

  await expect(
    page.getByText(/나의 포트폴리오: 초기 현금은 최소 .*50만원 이상이어야 합니다\./)
  ).toBeVisible();
  expect(simulationCallCount).toBe(0);
});

test("renders core controls on mobile viewport", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "mobile check runs once in chromium project");

  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/");
  await expect(page.getByTestId("run-simulation-btn")).toBeVisible();
  await expect(page.getByTestId("etf-search")).not.toBeVisible();
  await page.getByTestId("toggle-etf-picker").click();
  await expect(page.getByTestId("etf-search")).toBeVisible();
});

