import type { Metadata } from "next";
import { getAgentStatuses } from "@/lib/adapters";
import { Dashboard } from "@/components/dashboard";
import { LangfuseRepository, getDbStatus } from "@/lib/langfuse-import";
import type {
  CostMetrics,
  LLMRequestsResponse,
  ImportStatusInfo,
  DailyCost,
  LangfuseModelUsage,
  LLMRequest,
} from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
};

function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCosts(): CostMetrics {
  try {
    const repo = new LangfuseRepository();
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    const fromStr = toDateStr(from);
    const toStr = toDateStr(now);

    const metrics = repo.getDailyMetrics(fromStr, toStr);

    const dateMap = new Map<string, DailyCost>();
    for (const m of metrics) {
      let entry = dateMap.get(m.date);
      if (!entry) {
        entry = { date: m.date, totalCost: 0, countObservations: 0, usage: [] };
        dateMap.set(m.date, entry);
      }
      entry.totalCost += m.total_cost;
      entry.countObservations += m.request_count;
      const usage: LangfuseModelUsage = {
        model: m.model,
        inputUsage: m.input_tokens,
        outputUsage: m.output_tokens,
        totalUsage: m.total_tokens,
        totalCost: m.total_cost,
        countObservations: m.request_count,
      };
      entry.usage.push(usage);
    }

    const daily = Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    return { daily };
  } catch {
    return { daily: [] };
  }
}

function getImportStatus(): ImportStatusInfo {
  try {
    const repo = new LangfuseRepository();
    const lastImport = repo.getLatestImport();
    const counts = repo.getCounts();
    return {
      lastImport,
      lastStatus: lastImport?.status ?? null,
      counts,
    };
  } catch {
    return { lastImport: null, lastStatus: null, counts: { metrics: 0, requests: 0 } };
  }
}

function getRequests(): LLMRequestsResponse {
  const empty: LLMRequestsResponse = {
    data: [],
    meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 },
  };

  try {
    const repo = new LangfuseRepository();
    const { data: rows, total } = repo.getRequests(1, 50);

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

    return {
      data,
      meta: {
        page: 1,
        limit: 50,
        totalItems: total,
        totalPages: Math.ceil(total / 50),
      },
    };
  } catch {
    return empty;
  }
}

export default async function DashboardPage() {
  const dbStatus = getDbStatus();

  const [agents, costs, requests, importStatus] = await Promise.all([
    getAgentStatuses(),
    Promise.resolve(getCosts()),
    Promise.resolve(getRequests()),
    Promise.resolve(getImportStatus()),
  ]);

  return (
    <Dashboard
      initialAgents={agents}
      initialCosts={costs}
      initialRequests={requests}
      initialImportStatus={importStatus}
      dbError={dbStatus.ok ? undefined : dbStatus.error}
    />
  );
}
