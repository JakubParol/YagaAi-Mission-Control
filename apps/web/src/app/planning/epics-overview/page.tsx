"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  Radar,
  ShieldAlert,
  TimerReset,
  TrendingUp,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { Badge } from "@/components/ui/badge";
import { ThemedSelect } from "@/components/ui/themed-select";
import { apiUrl } from "@/lib/api-client";
import type { EpicStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import {
  applyClientEpicOverviewFilters,
  buildEpicOverviewStats,
  toPercentLabel,
  toStoriesLabel,
} from "./overview-view-model";
import {
  EPIC_OVERVIEW_DEFAULT_FILTERS,
  EPIC_OVERVIEW_PRESETS,
  EPIC_OVERVIEW_SORT_OPTIONS,
  type EpicOverviewAgent,
  type EpicOverviewFilters,
  type EpicOverviewItem,
  type EpicOverviewLabel,
  type EpicOverviewListEnvelope,
} from "./overview-types";

const FILTER_KEYS = {
  search: "q",
  status: "status",
  ownerId: "owner",
  label: "label",
  blocked: "blocked",
  sort: "sort",
  preset: "preset",
} as const;

type PresetKey = "all" | "at-risk" | "near-done";

interface AgentListEnvelope {
  data?: Array<{
    id?: string;
    name?: string;
    last_name?: string | null;
  }>;
}

interface LabelListEnvelope {
  data?: Array<{
    name?: string;
  }>;
}

interface FetchResult {
  rows: EpicOverviewItem[];
  agents: EpicOverviewAgent[];
  labels: EpicOverviewLabel[];
}

type PageState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; rows: EpicOverviewItem[]; agents: EpicOverviewAgent[]; labels: EpicOverviewLabel[] };

function parseEpicStatus(value: string | null): EpicStatus | "" {
  if (value === "TODO" || value === "IN_PROGRESS" || value === "DONE") return value;
  return "";
}

function parseBlocked(value: string | null): EpicOverviewFilters["blocked"] {
  if (value === "true" || value === "false") return value;
  return "";
}

function parsePreset(value: string | null): PresetKey {
  if (value === "at-risk" || value === "near-done") return value;
  return "all";
}

function parseSort(value: string | null): EpicOverviewFilters["sort"] {
  const allowed = new Set(EPIC_OVERVIEW_SORT_OPTIONS.map((item) => item.value));
  if (value && allowed.has(value as EpicOverviewFilters["sort"])) {
    return value as EpicOverviewFilters["sort"];
  }
  return EPIC_OVERVIEW_DEFAULT_FILTERS.sort;
}

function statusVariant(status: EpicStatus): "outline" | "secondary" | "default" {
  if (status === "DONE") return "default";
  if (status === "IN_PROGRESS") return "secondary";
  return "outline";
}

function resolveAgentLabel(agent: { id?: string; name?: string; last_name?: string | null }): string | null {
  if (!agent.id || !agent.name) return null;
  const fullName = [agent.name, agent.last_name ?? ""].join(" ").trim();
  return fullName.length > 0 ? fullName : agent.name;
}

function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-muted/50" role="presentation">
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function EpicOverviewPageContent() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<PageState>({ kind: "no-project" });

  const singleProjectId = !allSelected && selectedProjectIds.length === 1
    ? selectedProjectIds[0]
    : null;

  const filters = useMemo<EpicOverviewFilters>(() => ({
    search: searchParams.get(FILTER_KEYS.search) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.search,
    status: parseEpicStatus(searchParams.get(FILTER_KEYS.status)),
    ownerId: searchParams.get(FILTER_KEYS.ownerId) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.ownerId,
    label: searchParams.get(FILTER_KEYS.label) ?? EPIC_OVERVIEW_DEFAULT_FILTERS.label,
    blocked: parseBlocked(searchParams.get(FILTER_KEYS.blocked)),
    sort: parseSort(searchParams.get(FILTER_KEYS.sort)),
  }), [searchParams]);

  const preset = parsePreset(searchParams.get(FILTER_KEYS.preset));

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim().length === 0) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const applyPreset = useCallback((nextPreset: PresetKey) => {
    const presetConfig = EPIC_OVERVIEW_PRESETS.find((item) => item.key === nextPreset);
    if (!presetConfig) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set(FILTER_KEYS.preset, nextPreset);

    const merged: EpicOverviewFilters = {
      ...filters,
      ...presetConfig.overrides,
    };

    if (merged.blocked.length === 0) params.delete(FILTER_KEYS.blocked);
    else params.set(FILTER_KEYS.blocked, merged.blocked);

    if (merged.status.length === 0) params.delete(FILTER_KEYS.status);
    else params.set(FILTER_KEYS.status, merged.status);

    params.set(FILTER_KEYS.sort, merged.sort);

    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname);
  }, [filters, pathname, router, searchParams]);

  const fetchOverview = useCallback(async (projectId: string): Promise<FetchResult> => {
    const overviewParams = new URLSearchParams();
    overviewParams.set("project_id", projectId);
    overviewParams.set("limit", "100");
    overviewParams.set("sort", filters.sort);

    if (filters.search.trim().length > 0) overviewParams.set("text", filters.search.trim());
    if (filters.status.length > 0) overviewParams.set("status", filters.status);
    if (filters.ownerId.length > 0) overviewParams.set("owner", filters.ownerId);
    if (filters.label.trim().length > 0) overviewParams.set("label", filters.label.trim());
    if (filters.blocked.length > 0) overviewParams.set("is_blocked", filters.blocked);

    const [overviewRes, agentsRes, labelsRes] = await Promise.all([
      fetch(apiUrl(`/v1/planning/epics/overview?${overviewParams.toString()}`)),
      fetch(apiUrl("/v1/planning/agents?is_active=true&limit=100&sort=name")),
      fetch(apiUrl(`/v1/planning/labels?project_id=${projectId}&limit=100&sort=name`)),
    ]);

    if (!overviewRes.ok) {
      throw new Error(`Failed to load epic overview. HTTP ${overviewRes.status}.`);
    }

    const overviewBody = (await overviewRes.json()) as EpicOverviewListEnvelope;
    const rows = overviewBody.data ?? [];

    const agents = agentsRes.ok
      ? (((await agentsRes.json()) as AgentListEnvelope).data ?? [])
        .map((item) => {
          const label = resolveAgentLabel(item);
          return label && item.id ? { id: item.id, label } : null;
        })
        .filter((item): item is EpicOverviewAgent => item !== null)
        .sort((a, b) => a.label.localeCompare(b.label))
      : [];

    const labels = labelsRes.ok
      ? (((await labelsRes.json()) as LabelListEnvelope).data ?? [])
        .map((item) => {
          const name = item.name?.trim();
          return name ? { name } : null;
        })
        .filter((item): item is EpicOverviewLabel => item !== null)
      : [];

    return { rows, agents, labels };
  }, [filters.blocked, filters.label, filters.ownerId, filters.search, filters.sort, filters.status]);

  const refreshCurrentView = useCallback(async () => {
    if (!singleProjectId) throw new Error("Select a single project before refreshing.");
    const result = await fetchOverview(singleProjectId);
    setState({ kind: "ok", ...result });
  }, [fetchOverview, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) {
      return;
    }

    let cancelled = false;

    void fetchOverview(singleProjectId)
      .then((result) => {
        if (cancelled) return;
        setState({ kind: "ok", ...result });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load epic overview.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchOverview, singleProjectId]);

  const rows = useMemo(
    () => (state.kind === "ok"
      ? applyClientEpicOverviewFilters(state.rows, filters, preset)
      : []),
    [filters, preset, state],
  );

  const stats = useMemo(() => buildEpicOverviewStats(rows), [rows]);

  const statusOptions = [
    { value: "", label: "Status: All" },
    { value: "TODO", label: "TODO" },
    { value: "IN_PROGRESS", label: "IN PROGRESS" },
    { value: "DONE", label: "DONE" },
  ];

  const ownerOptions = [
    { value: "", label: "Owner: All" },
    ...(state.kind === "ok"
      ? state.agents.map((agent) => ({ value: agent.id, label: agent.label }))
      : []),
  ];

  const labelOptions = [
    { value: "", label: "Label: All" },
    ...(state.kind === "ok"
      ? state.labels.map((label) => ({ value: label.name, label: label.name }))
      : []),
  ];

  const blockedOptions = [
    { value: "", label: "Blocked: All" },
    { value: "true", label: "Blocked only" },
    { value: "false", label: "Unblocked only" },
  ];

  const topContext = state.kind === "ok"
    ? `${rows.length} of ${state.rows.length} epics visible`
    : undefined;

  const pageState = !singleProjectId
    ? { kind: "no-project" as const }
    : state;

  return (
    <>
      <PlanningTopShell
        icon={Radar}
        title="Epics Overview"
        subtitle="Health, progress, and risk overview for all epics in selected project."
        context={topContext}
        controls={singleProjectId ? (
          <div className="flex w-full flex-col gap-2">
            <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2">
              <input
                type="text"
                value={filters.search}
                onChange={(event) => updateParam(FILTER_KEYS.search, event.target.value)}
                placeholder="Search by epic key or title"
                className={cn(
                  "h-8 min-w-[220px] flex-1 rounded-md border border-border/60 bg-background px-3 text-sm",
                  "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
              />

              <ThemedSelect
                value={filters.status}
                options={statusOptions}
                placeholder="Status"
                onValueChange={(next) => updateParam(FILTER_KEYS.status, next)}
                triggerClassName="h-8 min-w-[130px] bg-background/70 text-xs"
                contentClassName="w-[180px]"
              />

              <ThemedSelect
                value={filters.ownerId}
                options={ownerOptions}
                placeholder="Owner"
                onValueChange={(next) => updateParam(FILTER_KEYS.ownerId, next)}
                triggerClassName="h-8 min-w-[150px] bg-background/70 text-xs"
                contentClassName="w-[220px]"
              />

              <ThemedSelect
                value={filters.label}
                options={labelOptions}
                placeholder="Label"
                onValueChange={(next) => updateParam(FILTER_KEYS.label, next)}
                triggerClassName="h-8 min-w-[140px] bg-background/70 text-xs"
                contentClassName="w-[200px]"
              />

              <ThemedSelect
                value={filters.blocked}
                options={blockedOptions}
                placeholder="Blocked"
                onValueChange={(next) => updateParam(FILTER_KEYS.blocked, next)}
                triggerClassName="h-8 min-w-[140px] bg-background/70 text-xs"
                contentClassName="w-[200px]"
              />

              <ThemedSelect
                value={filters.sort}
                options={EPIC_OVERVIEW_SORT_OPTIONS}
                placeholder="Sort"
                onValueChange={(next) => updateParam(FILTER_KEYS.sort, next)}
                triggerClassName="h-8 min-w-[165px] bg-background/70 text-xs"
                contentClassName="w-[210px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {EPIC_OVERVIEW_PRESETS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => applyPreset(item.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    preset === item.key
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/60 text-muted-foreground hover:border-border",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        actions={(
          <PlanningRefreshControl
            onRefresh={refreshCurrentView}
            disabled={!singleProjectId}
            className="items-stretch sm:items-end"
          />
        )}
      />

      {pageState.kind === "no-project" && (
        <EmptyState
          icon="default"
          title="Select a project"
          description="Choose a single project from the selector above to view epic health overview."
        />
      )}

      {pageState.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {pageState.kind === "error" && (
        <EmptyState
          icon="default"
          title="Failed to load epic overview"
          description={pageState.message}
        />
      )}

      {pageState.kind === "ok" && (
        <>
          <section className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Radar className="size-3.5" />
                Epics
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">{stats.epicCount}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5" />
                Avg progress
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">{toPercentLabel(stats.averageProgressPct)}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="size-3.5" />
                Blocked epics
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">{stats.blockedEpics}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TimerReset className="size-3.5" />
                Stale (≥7d)
              </div>
              <p className="mt-1 text-xl font-semibold text-foreground">{stats.staleEpics}</p>
            </div>
          </section>

          {rows.length === 0 ? (
            <EmptyState
              icon="default"
              title="No matching epics"
              description="No epic matches active filters/preset. Adjust filters to broaden scope."
            />
          ) : (
            <section className="overflow-hidden rounded-lg border border-border/60 bg-card/20">
              <div className="grid grid-cols-[120px_minmax(0,1fr)_90px_160px_130px_90px] gap-2 border-b border-border/30 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Epic</span>
                <span>Title</span>
                <span>Status</span>
                <span>Progress</span>
                <span>Stories</span>
                <span>Risk</span>
              </div>

              <div className="divide-y divide-border/20">
                {rows.map((item) => (
                  <article
                    key={item.epic_key}
                    className="grid grid-cols-[120px_minmax(0,1fr)_90px_160px_130px_90px] gap-2 px-3 py-2.5"
                  >
                    <p className="font-mono text-xs text-muted-foreground">{item.epic_key}</p>
                    <p className="truncate text-sm text-foreground" title={item.title}>{item.title}</p>

                    <Badge variant={statusVariant(item.status)} className="h-fit w-fit text-[11px]">
                      {item.status.replaceAll("_", " ")}
                    </Badge>

                    <div className="space-y-1">
                      <ProgressBar value={item.progress_pct} />
                      <p className="text-[11px] text-muted-foreground">{toPercentLabel(item.progress_pct)}</p>
                    </div>

                    <p className="text-[11px] text-muted-foreground">{toStoriesLabel(item)}</p>

                    <div className="flex items-center gap-1 text-[11px]">
                      {item.blocked_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-300">
                          <AlertTriangle className="size-3" />
                          {item.blocked_count}
                        </span>
                      ) : (
                        <span className="text-emerald-300">ok</span>
                      )}
                      {item.stale_days >= 7 ? (
                        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                          {item.stale_days}d
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

export default function PlanningEpicsOverviewPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <EpicOverviewPageContent />
    </Suspense>
  );
}
