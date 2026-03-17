"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Radar } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorCard } from "@/components/error-card";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { PlanningRefreshControl } from "@/components/planning/planning-refresh-control";
import { PlanningTopShell } from "@/components/planning/planning-top-shell";
import { ThemedSelect } from "@/components/ui/themed-select";
import { RunsPanel } from "./runs-panel";
import {
  fetchAttempts,
  fetchRuns,
  fetchTimeline,
  normalizeIsoFromLocalInput,
} from "./timeline-page-actions";
import { FAILURE_OPTIONS, STATUS_OPTIONS } from "./timeline-types";
import type { RunState } from "./timeline-types";
import {
  applyFailureFilter,
  buildTimelineUiEvents,
  type FailureCategoryFilter,
  type RunAttempt,
  type TimelineEvent,
} from "./timeline-view-model";

export default function PlanningTimelinePage() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();

  const [status, setStatus] = useState("");
  const [runIdSearch, setRunIdSearch] = useState("");
  const [failureFilter, setFailureFilter] = useState<FailureCategoryFilter>("");
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
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const projectContext =
    !allSelected && selectedProjectIds.length === 1
      ? `Project scope: ${selectedProjectIds[0]}`
      : "Orchestration runs are cross-project diagnostics.";

  const selectedRun = useMemo(
    () => runs.find((item) => item.run_id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const timelineRows = useMemo(() => {
    if (!selectedRun) return [];
    return buildTimelineUiEvents(
      timeline,
      attempts,
      selectedRun.run_id,
      selectedRun.status,
    );
  }, [attempts, selectedRun, timeline]);

  const filteredRows = useMemo(
    () => applyFailureFilter(timelineRows, failureFilter),
    [failureFilter, timelineRows],
  );

  const selectedEvent = useMemo(
    () =>
      filteredRows.find((event) => event.id === selectedEventId) ??
      filteredRows[0] ??
      null,
    [filteredRows, selectedEventId],
  );

  useEffect(() => {
    setSelectedEventId(filteredRows[0]?.id ?? null);
  }, [filteredRows]);

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
        if (current && rows.some((item) => item.run_id === current))
          return current;
        return rows[0].run_id;
      });
    } catch (error) {
      setRunsError(
        error instanceof Error ? error.message : "Failed to load runs.",
      );
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
      setTimelineError(
        error instanceof Error ? error.message : "Failed to load timeline.",
      );
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

  const retryAttempts = attempts.filter(
    (attempt) => attempt.retry_attempt > 1,
  ).length;
  const deadLetterAttempts = attempts.filter((attempt) =>
    Boolean(attempt.dead_lettered_at),
  ).length;

  return (
    <div className="space-y-4">
      <PlanningTopShell
        icon={Radar}
        title="Run Timeline"
        subtitle="Inspect orchestration lifecycle events and delivery attempts"
        context={projectContext}
        actions={
          <PlanningRefreshControl
            onRefresh={async () => {
              await loadRuns();
              await loadTimeline();
            }}
            label="Refresh timeline"
          />
        }
        controls={
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <ThemedSelect
              value={status}
              onValueChange={setStatus}
              options={STATUS_OPTIONS}
              placeholder="Status"
            />
            <ThemedSelect
              value={failureFilter}
              onValueChange={(value) =>
                setFailureFilter(value as FailureCategoryFilter)
              }
              options={FAILURE_OPTIONS}
              placeholder="Failure category"
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
        }
      />

      {runsError ? (
        <ErrorCard
          title="Timeline feed unavailable"
          message={runsError}
          suggestion="Verify API health and orchestration worker connectivity, then refresh. If this persists, inspect API logs for /v1/orchestration/runs and /timeline."
        />
      ) : null}

      {runsLoading && runs.length === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-lg border border-border/60 bg-card/30">
          <Loader2
            className="size-5 animate-spin text-muted-foreground"
            aria-label="Loading runs"
          />
        </div>
      ) : null}

      {!runsLoading && runs.length === 0 ? (
        <EmptyState
          icon="default"
          title="No matching orchestration runs"
          description="No runs matched your filters. Clear status/time/run filters or submit a new orchestration command to generate telemetry."
        >
          <p className="text-xs text-muted-foreground">
            Troubleshooting: confirm workers are running and publishing
            orchestration events.
          </p>
        </EmptyState>
      ) : null}

      {runs.length > 0 ? (
        <RunsPanel
          runs={runs}
          selectedRunId={selectedRunId}
          selectedRun={selectedRun}
          retryAttempts={retryAttempts}
          deadLetterAttempts={deadLetterAttempts}
          filteredRows={filteredRows}
          selectedEvent={selectedEvent}
          timelineLoading={timelineLoading}
          timelineError={timelineError}
          onSelectRun={setSelectedRunId}
          onSelectEvent={setSelectedEventId}
          onRefreshTimeline={() => void loadTimeline()}
          onCopyText={(value) => void copyText(value)}
        />
      ) : null}
    </div>
  );
}
