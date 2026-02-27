import type { Metadata } from "next";
import { getAgentStatuses } from "@/lib/adapters";
import { Dashboard } from "@/components/dashboard";
import { DashboardService } from "@/lib/langfuse-import";
import { getDbStatus } from "@/lib/db";
import type {
  CostMetrics,
  LLMRequestsResponse,
  ImportStatusInfo,
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
    const service = new DashboardService();
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return service.getCosts(toDateStr(from), toDateStr(now));
  } catch {
    return { daily: [] };
  }
}

function getImportStatus(): ImportStatusInfo {
  try {
    const service = new DashboardService();
    return service.getImportStatus();
  } catch {
    return { lastImport: null, lastStatus: null, counts: { metrics: 0, requests: 0 } };
  }
}

function getRequests(): LLMRequestsResponse {
  try {
    const service = new DashboardService();
    return service.getRequests(1, 50);
  } catch {
    return {
      data: [],
      meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 },
    };
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
