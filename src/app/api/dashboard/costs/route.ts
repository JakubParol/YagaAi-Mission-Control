import { NextRequest, NextResponse } from "next/server";

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

  const days = Number(request.nextUrl.searchParams.get("days") ?? "7");
  const validDays = [1, 7, 30].includes(days) ? days : 7;

  // Calculate date range
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - validDays);
  const fromStr = fromDate.toISOString().split("T")[0];
  const toStr = now.toISOString().split("T")[0];

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const url = `${host}/api/public/metrics/daily?tracesGroupedByName=false&fromTimestamp=${fromStr}T00:00:00Z&toTimestamp=${toStr}T23:59:59Z`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Langfuse metrics/daily error:", res.status, text);
      return NextResponse.json(
        { error: `Langfuse API error: ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json();
    return NextResponse.json({ daily: json.data ?? [] });
  } catch (err) {
    console.error("GET /api/dashboard/costs failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
