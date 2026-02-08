import { buildBenchmarkSummary } from "@/lib/benchmark";
import { getHistoricalSeries, YahooDataError } from "@/lib/yahoo";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ ticker: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { ticker } = await context.params;
  const url = new URL(request.url);

  const startDate = url.searchParams.get("start") ?? "2010-01-01";
  const endDate = url.searchParams.get("end") ?? new Date().toISOString().slice(0, 10);
  const riskFreeRateParam = url.searchParams.get("riskFreeRate");
  const riskFreeRate = riskFreeRateParam ? Number(riskFreeRateParam) : 0.02;

  try {
    const points = await getHistoricalSeries(ticker, startDate, endDate);
    const summary = buildBenchmarkSummary({
      ticker: ticker.toUpperCase(),
      points,
      riskFreeRate
    });

    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof YahooDataError
        ? error.message
        : "Failed to compute benchmark summary";

    return NextResponse.json(
      {
        error: message
      },
      {
        status: 502
      }
    );
  }
}

