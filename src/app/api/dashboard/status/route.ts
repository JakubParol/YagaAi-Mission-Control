import { NextResponse } from "next/server";
import { LangfuseRepository } from "@/lib/langfuse-import";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repo = new LangfuseRepository();
    const lastImport = repo.getLatestImport();
    const counts = repo.getCounts();

    return NextResponse.json({
      lastImport,
      lastStatus: lastImport?.status ?? null,
      counts,
    });
  } catch (err) {
    console.error("GET /api/dashboard/status failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
