import { NextRequest, NextResponse } from "next/server";
import { LangfuseRepository } from "@/lib/langfuse-import";
import type { LLMRequest } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const limit = 50;
  const model = request.nextUrl.searchParams.get("model") || undefined;
  const fromDate = request.nextUrl.searchParams.get("from") || undefined;
  const toDate = request.nextUrl.searchParams.get("to") || undefined;

  try {
    const repo = new LangfuseRepository();
    const { data: rows, total } = repo.getRequests(
      page,
      limit,
      model,
      fromDate,
      toDate,
    );

    const data: LLMRequest[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      model: r.model,
      startTime: r.started_at ?? new Date().toISOString(),
      endTime: r.finished_at ?? null,
      completionStartTime: null,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      totalTokens: r.total_tokens,
      cost: r.cost,
      latencyMs: r.latency_ms,
      metadata: null,
    }));

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages,
      },
    });
  } catch (err) {
    console.error("GET /api/dashboard/requests failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
