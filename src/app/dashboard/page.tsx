import type { Metadata } from "next";
import { getAgentStatuses } from "@/lib/adapters";
import { Dashboard } from "@/components/dashboard";
import type { CostMetrics, LLMRequestsResponse } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
};

async function fetchCosts(): Promise<CostMetrics> {
  const host = process.env.LANGFUSE_HOST;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!host || !publicKey || !secretKey) {
    return { daily: [] };
  }

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 7);

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const url = `${host}/api/public/metrics/daily?tracesGroupedByName=false&fromTimestamp=${from.toISOString().split("T")[0]}T00:00:00Z&toTimestamp=${now.toISOString().split("T")[0]}T23:59:59Z`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return { daily: [] };
    const json = await res.json();
    return { daily: json.data ?? [] };
  } catch {
    return { daily: [] };
  }
}

async function fetchRequests(): Promise<LLMRequestsResponse> {
  const host = process.env.LANGFUSE_HOST;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!host || !publicKey || !secretKey) {
    return { data: [], meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 } };
  }

  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const url = `${host}/api/public/observations?type=GENERATION&limit=50&page=1`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      return { data: [], meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 } };
    }

    const json = await res.json();
    const data = (json.data ?? []).map((obs: Record<string, unknown>) => {
      const usage = (obs.usage as Record<string, number>) ?? {};
      const startTime = obs.startTime as string | null;
      const endTime = obs.endTime as string | null;
      let latencyMs: number | null = null;
      if (startTime && endTime) {
        latencyMs = new Date(endTime).getTime() - new Date(startTime).getTime();
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
    });

    return {
      data,
      meta: json.meta ?? { page: 1, limit: 50, totalItems: 0, totalPages: 0 },
    };
  } catch {
    return { data: [], meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 } };
  }
}

export default async function DashboardPage() {
  const [agents, costs, requests] = await Promise.all([
    getAgentStatuses(),
    fetchCosts(),
    fetchRequests(),
  ]);

  return (
    <>
      <div className="mb-8">
        <h1 className="mb-1 text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Agent status, LLM costs, and recent requests
        </p>
      </div>

      <Dashboard
        initialAgents={agents}
        initialCosts={costs}
        initialRequests={requests}
      />
    </>
  );
}
