import { NextRequest, NextResponse } from "next/server";
import { LangfuseRepository } from "@/lib/langfuse-import";
import type { DailyCost, LangfuseModelUsage } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let fromStr: string;
  let toStr: string;

  if (fromParam && toParam) {
    fromStr = fromParam;
    toStr = toParam;
  } else {
    const days = Number(searchParams.get("days") ?? "7");
    const validDays = [1, 7, 30].includes(days) ? days : 7;
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - validDays);
    fromStr = fromDate.toISOString().split("T")[0];
    toStr = now.toISOString().split("T")[0];
  }

  try {
    const repo = new LangfuseRepository();
    const metrics = repo.getDailyMetrics(fromStr, toStr);

    // Group DailyMetric[] (one row per date+model) into DailyCost[] (one row per date)
    const dateMap = new Map<string, DailyCost>();

    for (const m of metrics) {
      let entry = dateMap.get(m.date);
      if (!entry) {
        entry = {
          date: m.date,
          totalCost: 0,
          countObservations: 0,
          usage: [],
        };
        dateMap.set(m.date, entry);
      }

      entry.totalCost += m.total_cost;
      entry.countObservations += m.request_count;

      const usage: LangfuseModelUsage = {
        model: m.model,
        inputUsage: m.input_tokens,
        outputUsage: m.output_tokens,
        totalUsage: m.total_tokens,
        totalCost: m.total_cost,
        countObservations: m.request_count,
      };
      entry.usage.push(usage);
    }

    const daily = Array.from(dateMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date),
    );

    return NextResponse.json({ daily });
  } catch (err) {
    console.error("GET /api/dashboard/costs failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
