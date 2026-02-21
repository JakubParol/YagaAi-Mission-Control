import { NextRequest, NextResponse } from "next/server";
import type { LLMRequest } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const host = process.env.LANGFUSE_HOST;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!host || !publicKey || !secretKey) {
    return NextResponse.json(
      { error: "Langfuse environment variables not configured" },
      { status: 500 },
    );
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const model = request.nextUrl.searchParams.get("model");
  const limit = 50;

  const params = new URLSearchParams({
    type: "GENERATION",
    limit: String(limit),
    page: String(page),
  });
  if (model) {
    params.set("name", model);
  }

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const url = `${host}/api/public/observations?${params}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Langfuse observations error:", res.status, text);
      return NextResponse.json(
        { error: `Langfuse API error: ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json();

    const data: LLMRequest[] = (json.data ?? []).map(
      (obs: Record<string, unknown>) => {
        const usage = (obs.usage as Record<string, number>) ?? {};
        const startTime = obs.startTime as string | null;
        const endTime = obs.endTime as string | null;
        let latencyMs: number | null = null;
        if (startTime && endTime) {
          latencyMs =
            new Date(endTime).getTime() - new Date(startTime).getTime();
        }

        return {
          id: obs.id as string,
          name: (obs.name as string) ?? null,
          model: (obs.model as string) ?? null,
          startTime: startTime ?? new Date().toISOString(),
          endTime: endTime ?? null,
          completionStartTime: (obs.completionStartTime as string) ?? null,
          inputTokens: usage.input ?? 0,
          outputTokens: usage.output ?? 0,
          totalTokens: usage.total ?? 0,
          cost: (obs.calculatedTotalCost as number) ?? null,
          latencyMs,
          metadata: (obs.metadata as Record<string, unknown>) ?? null,
        };
      },
    );

    return NextResponse.json({
      data,
      meta: json.meta ?? {
        page,
        limit,
        totalItems: 0,
        totalPages: 0,
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
