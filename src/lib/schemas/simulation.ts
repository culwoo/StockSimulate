import { z } from "zod";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const allocationSchema = z.object({
  ticker: z.string().trim().min(1).max(10),
  targetWeight: z.number().min(0).max(100),
  expenseRatio: z.number().min(0).max(0.05)
});

export const simulationRequestSchema = z
  .object({
    startDate: z.string().regex(isoDateRegex, "startDate must be YYYY-MM-DD"),
    endDate: z.string().regex(isoDateRegex, "endDate must be YYYY-MM-DD"),
    initialAmount: z.number().min(0),
    monthlySalary: z.number().min(0).default(2_500_000),
    monthlyContribution: z.number().min(0),
    minimumCashReserve: z.number().min(0).default(500_000),
    dividendPolicy: z.enum(["to_cash", "reinvest_same_asset"]).default("reinvest_same_asset"),
    allocations: z.array(allocationSchema).min(1).max(10),
    rebalanceFrequency: z.literal("quarterly").default("quarterly"),
    contributionRule: z.literal("first_trading_day").default("first_trading_day"),
    benchmarkTicker: z.string().trim().min(1).max(10).default("SPY"),
    riskFreeRate: z.number().min(0).max(0.2).default(0.02)
  })
  .superRefine((value, context) => {
    const start = new Date(`${value.startDate}T00:00:00Z`).getTime();
    const end = new Date(`${value.endDate}T00:00:00Z`).getTime();

    if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endDate must be after startDate",
        path: ["endDate"]
      });
    }

    const totalWeight = value.allocations.reduce((sum, item) => sum + item.targetWeight, 0);
    if (totalWeight <= 0.05) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation weights must include at least one positive weight",
        path: ["allocations"]
      });
    }

    if (totalWeight > 100.05) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation weights must be less than or equal to 100%",
        path: ["allocations"]
      });
    }

    const uniqueTickerCount = new Set(value.allocations.map((allocation) => allocation.ticker.toUpperCase()))
      .size;
    if (uniqueTickerCount !== value.allocations.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation tickers must be unique",
        path: ["allocations"]
      });
    }
  });

export type SimulationRequestInput = z.infer<typeof simulationRequestSchema>;

