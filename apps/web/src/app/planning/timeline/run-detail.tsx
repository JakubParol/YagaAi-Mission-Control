import { Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LifecycleEventsPanel } from "./lifecycle-events-panel";
import type { RunState } from "./timeline-types";
import {
  eventLabel,
  formatDateTime,
  statusBadgeClass,
  type TimelineUiEvent,
} from "./timeline-view-model";

export interface RunDetailProps {
  selectedRun: RunState;
  retryAttempts: number;
  deadLetterAttempts: number;
  filteredRows: TimelineUiEvent[];
  selectedEvent: TimelineUiEvent | null;
  timelineLoading: boolean;
  timelineError: string | null;
  onSelectEvent: (eventId: string) => void;
  onRefreshTimeline: () => void;
  onCopyText: (value: string | null) => void;
}

export function RunDetail({
  selectedRun,
  retryAttempts,
  deadLetterAttempts,
  filteredRows,
  selectedEvent,
  timelineLoading,
  timelineError,
  onSelectEvent,
  onRefreshTimeline,
  onCopyText,
}: RunDetailProps) {
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Selected run
          </p>
          <h2 className="font-mono text-sm text-foreground">
            {selectedRun.run_id}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn("text-[11px]", statusBadgeClass(selectedRun.status))}
          >
            {selectedRun.status}
          </Badge>
          <Badge
            variant="outline"
            className="text-[11px] border-blue-400/30 bg-blue-500/10 text-blue-100"
          >
            {retryAttempts} retries
          </Badge>
          <Badge
            variant="outline"
            className="text-[11px] border-red-400/30 bg-red-500/10 text-red-100"
          >
            {deadLetterAttempts} dead letters
          </Badge>
        </div>
      </header>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Correlation
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate font-mono text-xs">
              {selectedRun.correlation_id}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Copy correlation id"
              onClick={() => onCopyText(selectedRun.correlation_id)}
            >
              <Copy className="size-3" />
            </Button>
          </div>
        </div>
        <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Causation
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate font-mono text-xs">
              {selectedRun.causation_id ?? "-"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Copy causation id"
              onClick={() => onCopyText(selectedRun.causation_id)}
            >
              <Copy className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
        <LifecycleEventsPanel
          filteredRows={filteredRows}
          selectedEvent={selectedEvent}
          timelineLoading={timelineLoading}
          timelineError={timelineError}
          onSelectEvent={onSelectEvent}
          onRefreshTimeline={onRefreshTimeline}
        />
        <EventDrillDown
          selectedEvent={selectedEvent}
          onCopyText={onCopyText}
        />
      </div>
    </div>
  );
}

interface EventDrillDownProps {
  selectedEvent: TimelineUiEvent | null;
  onCopyText: (value: string | null) => void;
}

function EventDrillDown({ selectedEvent, onCopyText }: EventDrillDownProps) {
  return (
    <aside className="rounded-md border border-border/50 bg-background/50 p-3">
      {selectedEvent ? (
        <div className="space-y-3">
          <div className="border-b border-border/40 pb-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Drill-down
            </p>
            <h4 className="mt-1 text-sm font-semibold text-foreground">
              {eventLabel(selectedEvent.event_type)}
            </h4>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatDateTime(selectedEvent.occurred_at)}
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="rounded-md border border-border/40 bg-background/70 p-2">
              <p className="uppercase tracking-wide text-muted-foreground">
                Correlation ID
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="truncate font-mono">
                  {selectedEvent.correlation_id}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Copy selected event correlation id"
                  onClick={() => onCopyText(selectedEvent.correlation_id)}
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border/40 bg-background/70 p-2">
              <p className="uppercase tracking-wide text-muted-foreground">
                Causation ID
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="truncate font-mono">
                  {selectedEvent.causation_id ?? "-"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Copy selected event causation id"
                  onClick={() => onCopyText(selectedEvent.causation_id)}
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border/40 bg-background/70 p-2">
              <p className="uppercase tracking-wide text-muted-foreground">
                Reason
              </p>
              <p className="mt-1 text-muted-foreground">
                {selectedEvent.reason_code ?? "-"}
                {selectedEvent.reason_message
                  ? ` - ${selectedEvent.reason_message}`
                  : ""}
              </p>
            </div>

            <div className="rounded-md border border-border/40 bg-background/70 p-2">
              <p className="uppercase tracking-wide text-muted-foreground">
                Payload
              </p>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/20 p-2 text-[11px] text-blue-100">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-48 items-center justify-center text-center text-xs text-muted-foreground">
          Select an event to inspect correlation chain and failure details.
        </div>
      )}
    </aside>
  );
}
