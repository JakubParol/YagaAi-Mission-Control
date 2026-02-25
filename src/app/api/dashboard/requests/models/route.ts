import { NextResponse } from "next/server";
import { LangfuseRepository } from "@/lib/langfuse-import";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repo = new LangfuseRepository();
    const models = repo.getDistinctModels();
    return NextResponse.json({ models });
  } catch (err) {
    console.error("GET /api/dashboard/requests/models failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
