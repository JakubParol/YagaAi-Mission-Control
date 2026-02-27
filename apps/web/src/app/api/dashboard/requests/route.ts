import { NextResponse } from "next/server";
import { DashboardService } from "@/lib/langfuse-import";
import { withErrorHandler } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request) => {
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const limit = 50;
  const model = request.nextUrl.searchParams.get("model") || undefined;
  const fromDate = request.nextUrl.searchParams.get("from") || undefined;
  const toDate = request.nextUrl.searchParams.get("to") || undefined;

  const service = new DashboardService();
  return NextResponse.json(service.getRequests(page, limit, model, fromDate, toDate));
});
