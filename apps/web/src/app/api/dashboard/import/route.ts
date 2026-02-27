import { NextResponse } from "next/server";
import { LangfuseImportService } from "@/lib/langfuse-import";
import { withErrorHandler } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async () => {
  const service = new LangfuseImportService();
  const result = await service.runImport();
  return NextResponse.json(result);
});
