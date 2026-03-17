import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RunDetail } from "./run-detail";
import type { RunState } from "./timeline-types";
import {
  formatDateTime,
  statusBadgeClass,
  type TimelineUiEvent,
} from "./timeline-view-model";

export interface RunsPanelProps {
  runs: RunState[];
  selectedRunId: string | null;
  selectedRun: RunState | null;
  retryAttempts: number;
  deadLetterAttempts: number;
  filteredRows: TimelineUiEvent[];
  selectedEvent: TimelineUiEvent | null;
  timelineLoading: boolean;
  timelineError: string | null;
  onSelectRun: (runId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onRefreshTimeline: () => void;
  onCopyText: (value: string | null) => void;
}

export function RunsPanel({
  runs,
  selectedRunId,
  selectedRun,
  retryAttempts,
  deadLetterAttempts,
  filteredRows,
  selectedEvent,
  timelineLoading,
  timelineError,
  onSelectRun,
  onSelectEvent,
  onRefreshTimeline,
  onCopyText,
}: RunsPanelProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <section className="rounded-lg border border-border/60 bg-card/30 p-3">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Runs</h2>
          <Badge
            variant="outline"
            className="border-border/70 bg-background/70 text-xs"
          >
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
                onClick={() => onSelectRun(run.run_id)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition-colors",
                  isActive
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/60 bg-background/40 hover:border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-foreground">
                    {run.run_id}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", statusBadgeClass(run.status))}
                  >
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
          <RunDetail
            selectedRun={selectedRun}
            retryAttempts={retryAttempts}
            deadLetterAttempts={deadLetterAttempts}
            filteredRows={filteredRows}
            selectedEvent={selectedEvent}
            timelineLoading={timelineLoading}
            timelineError={timelineError}
            onSelectEvent={onSelectEvent}
            onRefreshTimeline={onRefreshTimeline}
            onCopyText={onCopyText}
          />
        ) : (
          <EmptyState
            icon="default"
            title="Select a run"
            description="Choose a run from the left stream to inspect ordered events, watchdog/retry/dead-letter transitions, and identifier chain."
          />
        )}
      </section>
    </div>
  );
}
