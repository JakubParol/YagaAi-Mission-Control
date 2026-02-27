import { NextResponse } from "next/server";
import { DashboardService } from "@/lib/langfuse-import";
import { withErrorHandler } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request) => {
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

  const service = new DashboardService();
  const costs = service.getCosts(fromStr, toStr);

  return NextResponse.json(costs);
});
