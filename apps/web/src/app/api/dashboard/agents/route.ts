import { NextResponse } from "next/server";
import { getAgentStatuses } from "@/lib/adapters";
import { withErrorHandler } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const agents = await getAgentStatuses();
  return NextResponse.json(agents);
});
