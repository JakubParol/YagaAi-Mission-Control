import { NextResponse } from "next/server";
import { DashboardService } from "@/lib/langfuse-import";
import { withErrorHandler } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const service = new DashboardService();
  return NextResponse.json(service.getImportStatus());
});
