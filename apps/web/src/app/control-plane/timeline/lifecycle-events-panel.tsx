import { Loader2, RefreshCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorCard } from "@/components/error-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FailureBadge } from "./failure-badge";
import {
  eventLabel,
  formatDateTime,
  type TimelineUiEvent,
} from "./timeline-view-model";

export interface LifecycleEventsPanelProps {
  filteredRows: TimelineUiEvent[];
  selectedEvent: TimelineUiEvent | null;
  timelineLoading: boolean;
  timelineError: string | null;
  onSelectEvent: (eventId: string) => void;
  onRefreshTimeline: () => void;
}

export function LifecycleEventsPanel({
  filteredRows,
  selectedEvent,
  timelineLoading,
  timelineError,
  onSelectEvent,
  onRefreshTimeline,
}: LifecycleEventsPanelProps) {
  return (
    <div className="rounded-md border border-border/50 bg-background/40">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <h3 className="text-sm font-medium text-foreground">
          Lifecycle events
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={onRefreshTimeline}
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
            suggestion="Retry refresh. If missing run data persists, verify workers are publishing control-plane events and dead-letter metadata."
          />
        </div>
      ) : null}

      {!timelineLoading && !timelineError && filteredRows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon="default"
            title="No lifecycle events for this filter"
            description="No transitions matched the selected time and failure filters. Clear category filters or widen the time window."
          />
        </div>
      ) : null}

      {!timelineLoading && !timelineError && filteredRows.length > 0 ? (
        <div className="max-h-[52vh] divide-y divide-border/30 overflow-auto">
          {filteredRows.map((event: TimelineUiEvent) => {
            const isSelected = selectedEvent?.id === event.id;
            return (
              <button
                key={event.id}
                type="button"
                className={cn(
                  "w-full px-3 py-2.5 text-left transition-colors",
                  isSelected ? "bg-primary/10" : "hover:bg-background/50",
                )}
                onClick={() => onSelectEvent(event.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {eventLabel(event.event_type)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDateTime(event.occurred_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="text-[10px] border-border/60 bg-background/80"
                    >
                      {event.decision}
                    </Badge>
                    <FailureBadge category={event.failure_category} />
                  </div>
                </div>
                {event.reason_code ? (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {event.reason_code}
                    {event.reason_message
                      ? ` - ${event.reason_message}`
                      : ""}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
