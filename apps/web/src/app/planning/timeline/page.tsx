"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, GitBranch, Loader2, Radar, RefreshCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorCard } from "@/components/error-card";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ui/themed-select";
import { apiUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type RunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

interface RunState {
  run_id: string;
  status: RunStatus;
  correlation_id: string;
  causation_id: string | null;
  last_event_type: string;
  updated_at: string;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  run_id: string;
  run_status: RunStatus;
  event_type: string;
  decision: string;
  reason_code: string | null;
  reason_message: string | null;
  correlation_id: string;
  causation_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
}

interface RunAttempt {
  outbox_event_id: string;
  retry_attempt: number;
  max_attempts: number;
  dead_lettered_at: string | null;
  last_error: string | null;
  correlation_id: string;
  causation_id: string | null;
}

interface ListEnvelope<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

interface ApiErrorEnvelope {
  error?: {
    message?: string;
    code?: string;
  };
}

const STATUS_OPTIONS: ThemedSelectOption[] = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "RUNNING", label: "Running" },
  { value: "SUCCEEDED", label: "Succeeded" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function normalizeIsoFromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function statusBadgeClass(status: RunStatus): string {
  if (status === "RUNNING") return "border-blue-400/40 bg-blue-500/10 text-blue-200";
  if (status === "SUCCEEDED") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (status === "FAILED") return "border-red-400/40 bg-red-500/10 text-red-200";
  if (status === "CANCELLED") return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  return "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
}

function eventLabel(value: string): string {
  return value
    .replace("orchestration.", "")
    .replaceAll(".", " ")
    .replaceAll("_", " ");
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorEnvelope;
    if (body.error?.message) {
      return body.error.message;
    }
  } catch {
    // Ignore parse errors and use fallback.
  }
  return `${fallback} (HTTP ${response.status}).`;
}

async function fetchRuns(params: { status: string; runId: string }): Promise<RunState[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.runId.trim()) query.set("run_id", params.runId.trim());
  query.set("limit", "100");

  const response = await fetch(apiUrl(`/v1/orchestration/runs?${query.toString()}`));
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load orchestration runs"));
  }
  const body = (await response.json()) as ListEnvelope<RunState>;
  return body.data ?? [];
}

async function fetchTimeline(params: {
  runId: string;
  status: string;
  occurredAfter: string | null;
  occurredBefore: string | null;
}): Promise<TimelineEvent[]> {
  const query = new URLSearchParams();
  query.set("run_id", params.runId);
  if (params.status) query.set("status", params.status);
  if (params.occurredAfter) query.set("occurred_after", params.occurredAfter);
  if (params.occurredBefore) query.set("occurred_before", params.occurredBefore);
  query.set("limit", "200");

  const response = await fetch(apiUrl(`/v1/orchestration/timeline?${query.toString()}`));
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load timeline events"));
  }
  const body = (await response.json()) as ListEnvelope<TimelineEvent>;
  return body.data ?? [];
}

async function fetchAttempts(runId: string): Promise<RunAttempt[]> {
  const response = await fetch(apiUrl(`/v1/orchestration/runs/${runId}/attempts?limit=100`));
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load run attempts"));
  }
  const body = (await response.json()) as ListEnvelope<RunAttempt>;
  return body.data ?? [];
}

export default function PlanningTimelinePage() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const [status, setStatus] = useState("");
  const [runIdSearch, setRunIdSearch] = useState("");
  const [occurredAfterInput, setOccurredAfterInput] = useState("");
  const [occurredBeforeInput, setOccurredBeforeInput] = useState("");

  const [runs, setRuns] = useState<RunState[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [attempts, setAttempts] = useState<RunAttempt[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const projectContext =
    !allSelected && selectedProjectIds.length === 1
      ? `Project scope: ${selectedProjectIds[0]}`
      : "Orchestration runs are cross-project diagnostics.";

  const selectedRun = useMemo(
    () => runs.find((item) => item.run_id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const copyText = useCallback(async (value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard may be unavailable in non-secure origins.
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const rows = await fetchRuns({ status, runId: runIdSearch });
      setRuns(rows);
      setSelectedRunId((current) => {
        if (rows.length === 0) return null;
        if (current && rows.some((item) => item.run_id === current)) return current;
        return rows[0].run_id;
      });
    } catch (error) {
      setRunsError(error instanceof Error ? error.message : "Failed to load runs.");
      setRuns([]);
      setSelectedRunId(null);
    } finally {
      setRunsLoading(false);
    }
  }, [runIdSearch, status]);

  const loadTimeline = useCallback(async () => {
    if (!selectedRunId) {
      setTimeline([]);
      setAttempts([]);
      setTimelineError(null);
      return;
    }

    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const occurredAfter = normalizeIsoFromLocalInput(occurredAfterInput);
      const occurredBefore = normalizeIsoFromLocalInput(occurredBeforeInput);
      const [events, runAttempts] = await Promise.all([
        fetchTimeline({
          runId: selectedRunId,
          status,
          occurredAfter,
          occurredBefore,
        }),
        fetchAttempts(selectedRunId),
      ]);
      setTimeline(events);
      setAttempts(runAttempts);
    } catch (error) {
      setTimelineError(error instanceof Error ? error.message : "Failed to load timeline.");
      setTimeline([]);
      setAttempts([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [occurredAfterInput, occurredBeforeInput, selectedRunId, status]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  const retryAttempts = attempts.filter((attempt) => attempt.retry_attempt > 1).length;
  const deadLetterAttempts = attempts.filter((attempt) => Boolean(attempt.dead_lettered_at)).length;

  return (
    <div className="space-y-4">
      <PlanningTopShell
        icon={Radar}
        title="Run Timeline"
        subtitle="Inspect orchestration lifecycle events and delivery attempts"
        context={projectContext}
        actions={(
          <PlanningRefreshControl
            onRefresh={async () => {
              await loadRuns();
              await loadTimeline();
            }}
            label="Refresh timeline"
          />
        )}
        controls={(
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <ThemedSelect
              value={status}
              onValueChange={setStatus}
              options={STATUS_OPTIONS}
              placeholder="Status"
            />
            <label className="flex h-9 items-center rounded-md border border-border/60 bg-background/80 px-3 text-sm">
              <span className="mr-2 text-xs text-muted-foreground">Run</span>
              <input
                value={runIdSearch}
                onChange={(event) => setRunIdSearch(event.target.value)}
                placeholder="run-123"
                className="w-full bg-transparent text-sm text-foreground outline-none"
                aria-label="Filter by run id"
              />
            </label>
            <label className="flex h-9 items-center rounded-md border border-border/60 bg-background/80 px-3 text-xs text-muted-foreground">
              <span className="mr-2">From</span>
              <input
                type="datetime-local"
                value={occurredAfterInput}
                onChange={(event) => setOccurredAfterInput(event.target.value)}
                className="w-full bg-transparent text-sm text-foreground outline-none"
                aria-label="Occurred after"
              />
            </label>
            <label className="flex h-9 items-center rounded-md border border-border/60 bg-background/80 px-3 text-xs text-muted-foreground">
              <span className="mr-2">To</span>
              <input
                type="datetime-local"
                value={occurredBeforeInput}
                onChange={(event) => setOccurredBeforeInput(event.target.value)}
                className="w-full bg-transparent text-sm text-foreground outline-none"
                aria-label="Occurred before"
              />
            </label>
          </div>
        )}
      />

      {runsError ? (
        <ErrorCard
          title="Timeline feed unavailable"
          message={runsError}
          suggestion="Verify API service health, then refresh. If this persists, check API logs for /v1/orchestration endpoints."
        />
      ) : null}

      {runsLoading && runs.length === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-lg border border-border/60 bg-card/30">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading runs" />
        </div>
      ) : null}

      {!runsLoading && runs.length === 0 ? (
        <EmptyState
          icon="default"
          title="No matching orchestration runs"
          description="No runs matched your filters. Clear status/time/run filters or submit a new orchestration command to generate telemetry."
        />
      ) : null}

      {runs.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
          <section className="rounded-lg border border-border/60 bg-card/30 p-3">
            <header className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Runs</h2>
              <Badge variant="outline" className="border-border/70 bg-background/70 text-xs">
                {runs.length}
              </Badge>
            </header>

            <div className="max-h-[66vh] space-y-2 overflow-auto pr-1">
              {runs.map((run) => {
                const isActive = run.run_id === selectedRunId;
                return (
                  <button
                    key={run.run_id}
                    type="button"
                    onClick={() => setSelectedRunId(run.run_id)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors",
                      isActive
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/60 bg-background/40 hover:border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-foreground">{run.run_id}</span>
                      <Badge variant="outline" className={cn("text-[10px]", statusBadgeClass(run.status))}>
                        {run.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Updated {formatDateTime(run.updated_at)}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border/60 bg-card/30 p-3">
            {selectedRun ? (
              <div className="space-y-3">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected run</p>
                    <h2 className="font-mono text-sm text-foreground">{selectedRun.run_id}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("text-[11px]", statusBadgeClass(selectedRun.status))}>
                      {selectedRun.status}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] border-blue-400/30 bg-blue-500/10 text-blue-100">
                      {retryAttempts} retries
                    </Badge>
                    <Badge variant="outline" className="text-[11px] border-red-400/30 bg-red-500/10 text-red-100">
                      {deadLetterAttempts} dead letters
                    </Badge>
                  </div>
                </header>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Correlation</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="truncate font-mono text-xs">{selectedRun.correlation_id}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Copy correlation id"
                        onClick={() => void copyText(selectedRun.correlation_id)}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Causation</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="truncate font-mono text-xs">{selectedRun.causation_id ?? "-"}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Copy causation id"
                        onClick={() => void copyText(selectedRun.causation_id)}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border/50 bg-background/40">
                  <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
                    <h3 className="text-sm font-medium text-foreground">Lifecycle events</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => void loadTimeline()}
                    >
                      <RefreshCw className="size-3.5" />
                      Refresh
                    </Button>
                  </div>

                  {timelineLoading ? (
                    <div className="flex h-36 items-center justify-center">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : null}

                  {timelineError ? (
                    <div className="p-3">
                      <ErrorCard
                        title="Timeline unavailable"
                        message={timelineError}
                        suggestion="Retry refresh. If missing run data persists, verify workers are publishing orchestration events."
                      />
                    </div>
                  ) : null}

                  {!timelineLoading && !timelineError && timeline.length === 0 ? (
                    <div className="p-4">
                      <EmptyState
                        icon="default"
                        title="No lifecycle events in selected range"
                        description="No events matched the selected time filters. Expand the window or clear the date range to inspect historical transitions."
                      />
                    </div>
                  ) : null}

                  {!timelineLoading && !timelineError && timeline.length > 0 ? (
                    <div className="max-h-[52vh] divide-y divide-border/30 overflow-auto">
                      {timeline.map((event) => (
                        <article key={event.id} className="px-3 py-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{eventLabel(event.event_type)}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(event.occurred_at)}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] border-border/60 bg-background/80">
                                {event.decision}
                              </Badge>
                              {event.event_type.includes("watchdog") ? (
                                <Badge variant="outline" className="text-[10px] border-amber-400/30 bg-amber-500/10 text-amber-100">
                                  <AlertTriangle className="mr-1 size-3" />
                                  Watchdog
                                </Badge>
                              ) : null}
                              {event.decision === "REJECTED" ? (
                                <Badge variant="outline" className="text-[10px] border-red-400/30 bg-red-500/10 text-red-100">
                                  <GitBranch className="mr-1 size-3" />
                                  Rejected
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          {event.reason_code ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {event.reason_code}
                              {event.reason_message ? ` - ${event.reason_message}` : ""}
                            </p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState
                icon="default"
                title="Select a run"
                description="Choose a run from the left stream to inspect its ordered events, retries, and failure context."
              />
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
