import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
import { apiUrl } from "@/lib/api-client";
import type {
  AgentStatus,
  CostMetrics,
  LLMRequestsResponse,
  ImportStatusInfo,
} from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
};

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export default async function DashboardPage() {
  const [agents, costs, requests, importStatus] = await Promise.all([
    fetchJson<AgentStatus[]>("/v1/observability/agents", []),
    fetchJson<CostMetrics>("/v1/observability/costs?days=7", { daily: [] }),
    fetchJson<LLMRequestsResponse>("/v1/observability/requests?page=1&limit=50", {
      data: [],
      meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 },
    }),
    fetchJson<ImportStatusInfo>("/v1/observability/imports/status", {
      lastImport: null,
      lastStatus: null,
      counts: { metrics: 0, requests: 0 },
    }),
  ]);

  return (
    <Dashboard
      initialAgents={agents}
      initialCosts={costs}
      initialRequests={requests}
      initialImportStatus={importStatus}
    />
  );
}
