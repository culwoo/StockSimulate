# StockSimulate MVP

StockSimulate is a US ETF-focused simulation app built with Next.js.

## Features

- ETF comparison dashboard (CAGR, cumulative return, MDD, volatility, Sharpe)
- Contribution-based portfolio simulation
- Quarterly rebalancing with 0.5% drift tolerance
- Adjusted close based return engine with daily expense-ratio drag
- Portfolio vs benchmark charts (growth, drawdown, yearly returns)
- Scenario save/load with browser local storage
- CSV export for simulation results

## API Endpoints

- `GET /api/etfs?query=`
- `GET /api/etfs/{ticker}/history?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `POST /api/simulations/run`
- `GET /api/benchmarks/{ticker}/summary?start=YYYY-MM-DD&end=YYYY-MM-DD`

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Testing

```bash
npm run test
npm run test:e2e
```

For Playwright on first run:

```bash
npx playwright install chromium
```

