"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DollarSign,
  Hash,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type {
  AgentStatus,
  CostMetrics,
  LLMRequestsResponse,
  ImportStatusInfo,
  LLMRequest,
  DailyCost,
  ModelUsage,
  LangfuseModelUsage,
} from "@/lib/dashboard-types";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Agent Section
// ---------------------------------------------------------------------------

const AGENT_INITIALS: Record<string, string> = {
  James: "J",
  Naomi: "N",
  Amos: "A",
  Alex: "X",
};

const AGENT_COLORS: Record<string, string> = {
  James: "bg-primary/20 text-primary",
  Naomi: "bg-blue-500/20 text-blue-400",
  Amos: "bg-green-500/20 text-green-400",
  Alex: "bg-purple-500/20 text-purple-400",
};

function AgentCard({ agent }: { agent: AgentStatus }) {
  const isWorking = agent.status === "working";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
            AGENT_COLORS[agent.name] ?? "bg-muted text-muted-foreground",
          )}
        >
          {AGENT_INITIALS[agent.name] ?? agent.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
        </div>
        <div
          className="flex items-center gap-1.5"
          role="status"
          aria-label={`${agent.name} is ${agent.status}`}
        >
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              isWorking
                ? "animate-pulse bg-amber-400"
                : "bg-green-400",
            )}
          />
          <span
            className={cn(
              "text-xs font-medium",
              isWorking ? "text-amber-400" : "text-green-400",
            )}
          >
            {isWorking ? "Working" : "Idle"}
          </span>
        </div>
      </div>
      {isWorking && agent.task && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {agent.task}
        </p>
      )}
    </div>
  );
}

function AgentsSection({ initialData }: { initialData: AgentStatus[] }) {
  const { data: agents } = useAutoRefresh<AgentStatus[]>({
    url: "/api/dashboard/agents",
    interval: 15000,
    initialData,
  });

  return (
    <section aria-label="Agent status">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Agents</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard key={agent.name} agent={agent} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Costs Section
// ---------------------------------------------------------------------------

const TIME_RANGES = [
  { label: "Today", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
] as const;

function mapUsage(u: LangfuseModelUsage): ModelUsage {
  return {
    model: u.model,
    inputTokens: u.inputUsage ?? 0,
    outputTokens: u.outputUsage ?? 0,
    totalCost: u.totalCost ?? 0,
    countObservations: u.countObservations ?? 0,
  };
}

function aggregateCosts(daily: DailyCost[]) {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  let todaySpend = 0;
  let yesterdaySpend = 0;
  let todayRequests = 0;
  let totalCost = 0;
  let totalRequests = 0;

  const modelMap = new Map<string, ModelUsage>();

  for (const day of daily) {
    const date = day.date?.split("T")[0];
    totalCost += day.totalCost ?? 0;
    totalRequests += day.countObservations ?? 0;

    if (date === today) {
      todaySpend += day.totalCost ?? 0;
      todayRequests += day.countObservations ?? 0;
    }
    if (date === yesterday) {
      yesterdaySpend += day.totalCost ?? 0;
    }

    for (const u of day.usage ?? []) {
      const existing = modelMap.get(u.model);
      if (existing) {
        existing.inputTokens += u.inputUsage ?? 0;
        existing.outputTokens += u.outputUsage ?? 0;
        existing.totalCost += u.totalCost ?? 0;
        existing.countObservations += u.countObservations ?? 0;
      } else {
        modelMap.set(u.model, mapUsage(u));
      }
    }
  }

  const avgCost = totalRequests > 0 ? totalCost / totalRequests : 0;
  const models = Array.from(modelMap.values()).sort(
    (a, b) => b.totalCost - a.totalCost,
  );

  return { todaySpend, yesterdaySpend, todayRequests, avgCost, models };
}

function CostsSection({ initialData }: { initialData: CostMetrics }) {
  const [days, setDays] = useState<1 | 7 | 30>(7);

  const { data: costs } = useAutoRefresh<CostMetrics>({
    url: `/api/dashboard/costs?days=${days}`,
    interval: 30000,
    initialData,
  });

  const { todaySpend, yesterdaySpend, todayRequests, avgCost, models } =
    useMemo(() => aggregateCosts(costs.daily), [costs.daily]);

  return (
    <section aria-label="LLM costs">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">LLM Costs</h2>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setDays(range.days as 1 | 7 | 30)}
              className={cn(
                "focus-ring rounded-md px-3 py-1 text-xs font-medium transition-colors",
                days === range.days
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CostStatCard
          label="Today's Spend"
          value={formatUSD(todaySpend)}
          icon={DollarSign}
          iconColor="text-green-400"
          iconBg="bg-green-500/10"
        />
        <CostStatCard
          label="Yesterday's Spend"
          value={formatUSD(yesterdaySpend)}
          icon={DollarSign}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10"
        />
        <CostStatCard
          label="Requests Today"
          value={String(todayRequests)}
          icon={Hash}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
        />
        <CostStatCard
          label="Avg Cost/Request"
          value={formatUSD(avgCost)}
          icon={TrendingUp}
          iconColor="text-purple-400"
          iconBg="bg-purple-500/10"
        />
      </div>

      {/* Per-model table */}
      {models.length > 0 && (
        <div className="mb-8 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Model
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Requests
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Tokens In
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Tokens Out
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Total Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr
                  key={m.model}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs text-foreground">
                    {m.model}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {m.countObservations}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatTokens(m.inputTokens)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatTokens(m.outputTokens)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatUSD(m.totalCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CostStatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
      <div
        aria-hidden="true"
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          iconBg,
        )}
      >
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums text-foreground">
          {value}
        </p>
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requests Section
// ---------------------------------------------------------------------------

function RequestRow({ req }: { req: LLMRequest }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer border-b border-border transition-colors hover:bg-white/[0.02]"
      >
        <td className="px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {timeAgo(req.startTime)}
          </span>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-foreground">
          {req.model ?? "—"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
          {formatTokens(req.inputTokens)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
          {formatTokens(req.outputTokens)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-xs text-foreground">
          {req.cost != null ? formatUSD(req.cost) : "—"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
          {req.latencyMs != null ? `${(req.latencyMs / 1000).toFixed(1)}s` : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">ID: </span>
                <span className="font-mono text-foreground">
                  {req.id.slice(0, 12)}...
                </span>
              </div>
              {req.name && (
                <div>
                  <span className="text-muted-foreground">Name: </span>
                  <span className="text-foreground">{req.name}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Total tokens: </span>
                <span className="tabular-nums text-foreground">
                  {formatTokens(req.totalTokens)}
                </span>
              </div>
              {req.completionStartTime && (
                <div>
                  <span className="text-muted-foreground">TTFB: </span>
                  <span className="tabular-nums text-foreground">
                    {(
                      (new Date(req.completionStartTime).getTime() -
                        new Date(req.startTime).getTime()) /
                      1000
                    ).toFixed(1)}
                    s
                  </span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RequestsSection({
  initialData,
}: {
  initialData: LLMRequestsResponse;
}) {
  const [page, setPage] = useState(1);
  const [modelFilter, setModelFilter] = useState<string>("");

  const url = `/api/dashboard/requests?page=${page}${modelFilter ? `&model=${encodeURIComponent(modelFilter)}` : ""}`;
  const { data: response } = useAutoRefresh<LLMRequestsResponse>({
    url,
    interval: 30000,
    initialData,
  });

  // Extract unique models from current data for filter dropdown
  const models = useMemo(() => {
    const set = new Set<string>();
    for (const r of response.data) {
      if (r.model) set.add(r.model);
    }
    return Array.from(set).sort();
  }, [response.data]);

  return (
    <section aria-label="Recent LLM requests">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Recent Requests
        </h2>
        <select
          value={modelFilter}
          onChange={(e) => {
            setModelFilter(e.target.value);
            setPage(1);
          }}
          className="focus-ring rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground"
          aria-label="Filter by model"
        >
          <option value="">All Models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Model
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Tokens In
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Tokens Out
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Cost
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                Latency
              </th>
            </tr>
          </thead>
          <tbody>
            {response.data.length > 0 ? (
              response.data.map((req) => (
                <RequestRow key={req.id} req={req} />
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No requests found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {response.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {response.meta.page} of {response.meta.totalPages} ({response.meta.totalItems} total)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={cn(
                "focus-ring rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
                page <= 1
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : "text-foreground hover:bg-white/[0.04]",
              )}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= response.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={cn(
                "focus-ring rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
                page >= response.meta.totalPages
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : "text-foreground hover:bg-white/[0.04]",
              )}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Import Button
// ---------------------------------------------------------------------------

type ImportButtonState = "idle" | "loading" | "success" | "error";

function ImportButton({
  onImportComplete,
}: {
  onImportComplete: () => void;
}) {
  const [state, setState] = useState<ImportButtonState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    setState("loading");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/dashboard/import", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setState("success");
      onImportComplete();
      // Reset to idle after a brief flash
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Import failed");
      setTimeout(() => setState("idle"), 5000);
    }
  }, [onImportComplete]);

  return (
    <div className="flex items-center gap-3">
      {state === "error" && errorMsg && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {errorMsg}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleImport}
        disabled={state === "loading"}
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "success" ? (
          <CheckCircle2 className="h-4 w-4 text-green-400" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {state === "loading"
          ? "Importing…"
          : state === "success"
            ? "Imported"
            : "Import from Langfuse"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Status Bar
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ImportStatusBar({ status }: { status: ImportStatusInfo }) {
  const { lastImport, counts } = status;
  if (!lastImport) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card/50 px-4 py-2.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        Last import: {formatDate(lastImport.started_at)}
      </span>
      <Badge
        variant={lastImport.status === "success" ? "secondary" : "destructive"}
        className="text-[10px] uppercase tracking-wider"
      >
        {lastImport.status}
      </Badge>
      <span className="inline-flex items-center gap-1.5">
        <Database className="h-3 w-3" />
        {counts.metrics} metrics · {counts.requests} requests
      </span>
      {(lastImport.from_timestamp || lastImport.to_timestamp) && (
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="h-3 w-3" />
          {lastImport.from_timestamp
            ? formatDate(lastImport.from_timestamp)
            : "start"}
          {" → "}
          {formatDate(lastImport.to_timestamp)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------

export interface DashboardProps {
  initialAgents: AgentStatus[];
  initialCosts: CostMetrics;
  initialRequests: LLMRequestsResponse;
  initialImportStatus: ImportStatusInfo;
}

export function Dashboard({
  initialAgents,
  initialCosts,
  initialRequests,
  initialImportStatus,
}: DashboardProps) {
  const [importStatus, setImportStatus] =
    useState<ImportStatusInfo>(initialImportStatus);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleImportComplete = useCallback(async () => {
    // Re-fetch import status
    try {
      const res = await fetch("/api/dashboard/status");
      if (res.ok) {
        const data: ImportStatusInfo = await res.json();
        setImportStatus(data);
      }
    } catch {
      // Status fetch failed; data will refresh on next page load
    }
    // Bump key to force sections to re-fetch
    setRefreshKey((k) => k + 1);
  }, []);

  const isEmpty =
    importStatus.counts.metrics === 0 &&
    importStatus.counts.requests === 0 &&
    !importStatus.lastImport;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Agent status, LLM costs, and recent requests
          </p>
        </div>
        <ImportButton onImportComplete={handleImportComplete} />
      </div>

      {/* Import status bar */}
      <ImportStatusBar status={importStatus} />

      {isEmpty ? (
        <EmptyState
          icon="board"
          title="No data yet"
          description="Import data from Langfuse to see agent costs, request metrics, and usage breakdowns."
        >
          <ImportButton onImportComplete={handleImportComplete} />
        </EmptyState>
      ) : (
        <>
          <AgentsSection key={`agents-${refreshKey}`} initialData={initialAgents} />
          <CostsSection key={`costs-${refreshKey}`} initialData={initialCosts} />
          <RequestsSection key={`requests-${refreshKey}`} initialData={initialRequests} />
        </>
      )}
    </div>
  );
}
