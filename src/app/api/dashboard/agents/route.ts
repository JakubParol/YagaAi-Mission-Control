import { NextResponse } from "next/server";
import { getAgentStatuses } from "@/lib/adapters";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const agents = await getAgentStatuses();
    return NextResponse.json(agents);
  } catch (err) {
    console.error("GET /api/dashboard/agents failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
