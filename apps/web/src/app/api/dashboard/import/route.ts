import { NextResponse } from "next/server";
import { LangfuseImportService } from "@/lib/langfuse-import";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const service = new LangfuseImportService();
    const result = await service.runImport();
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/dashboard/import failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
