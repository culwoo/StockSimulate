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

  try {
    const points = await getHistoricalSeries(ticker, startDate, endDate);

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      startDate,
      endDate,
      points
    });
  } catch (error) {
    const message =
      error instanceof YahooDataError
        ? error.message
        : "Failed to fetch history from external market data source";

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


