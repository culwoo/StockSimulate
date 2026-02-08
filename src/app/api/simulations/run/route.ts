import { simulationRequestSchema } from "@/lib/schemas/simulation";
import { runSimulation } from "@/lib/simulator";
import { YahooDataError } from "@/lib/yahoo";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = simulationRequestSchema.parse(body);

    const result = await runSimulation(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid simulation request",
          details: error.issues
        },
        {
          status: 400
        }
      );
    }

    if (error instanceof YahooDataError) {
      return NextResponse.json(
        {
          error: "Failed to fetch market data from Yahoo Finance. Please try again."
        },
        {
          status: 502
        }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to run simulation";

    return NextResponse.json(
      {
        error: message
      },
      {
        status: 500
      }
    );
  }
}

