import type { DragEvent, ReactNode } from "react";
import {
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemStatus } from "@/lib/planning/types";
import { StoryLabelChips, type StoryLabel } from "./story-label-chips";
import {
  STORY_TYPE_CONFIG,
  StoryTypeBadge,
} from "./story-type-badge";

export interface StoryCardStory {
  id: string;
  key: string | null;
  title: string;
  status: ItemStatus;
  priority: number | null;
  story_type: string;
  epic_key?: string | null;
  epic_title?: string | null;
  position: number;
  task_count: number;
  done_task_count: number;
  labels?: StoryLabel[];
  label_ids?: string[];
}

export const STATUS_STYLE: Record<
  ItemStatus,
  { dot: string; bg: string; text: string }
> = {
  TODO: { dot: "bg-slate-400", bg: "bg-slate-400/10", text: "text-slate-400" },
  IN_PROGRESS: { dot: "bg-blue-400", bg: "bg-blue-400/10", text: "text-blue-400" },
  CODE_REVIEW: { dot: "bg-violet-400", bg: "bg-violet-400/10", text: "text-violet-400" },
  VERIFY: { dot: "bg-amber-400", bg: "bg-amber-400/10", text: "text-amber-400" },
  DONE: { dot: "bg-emerald-400", bg: "bg-emerald-400/10", text: "text-emerald-400" },
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  TODO: "Todo",
  IN_PROGRESS: "In Progress",
  CODE_REVIEW: "Code Review",
  VERIFY: "Verify",
  DONE: "Done",
};

export const TYPE_CONFIG = STORY_TYPE_CONFIG;

export const STORY_CARD_LAYOUT = {
  metadataRow: "flex items-center justify-between gap-2 mb-0.5",
  metadataLeft: "flex min-w-0 items-center gap-1.5",
  taskProgress: "min-h-4 min-w-[44px] text-right",
} as const;

function PriorityIndicator({ priority }: { priority: number | null }) {
  if (priority === null) return null;

  if (priority <= 2) {
    return (
      <span className="flex items-center text-red-400" title={`Priority ${priority}`}>
        <ChevronUp className="size-3.5 -mb-0.5" />
        <ChevronUp className="size-3.5 -mt-0.5" />
      </span>
    );
  }
  if (priority <= 4) {
    return (
      <span className="flex items-center text-amber-400" title={`Priority ${priority}`}>
        <ChevronUp className="size-3.5" />
      </span>
    );
  }
  if (priority <= 6) {
    return (
      <span className="flex items-center text-slate-400" title={`Priority ${priority}`}>
        <Minus className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="flex items-center text-blue-400" title={`Priority ${priority}`}>
      <ChevronDown className="size-3.5" />
    </span>
  );
}

export function StoryCard({
  story,
  onClick,
  onDragStart,
  onDragEnd,
  disabled = false,
  actions,
}: {
  story: StoryCardStory;
  onClick?: (storyId: string) => void;
  onDragStart?: (storyId: string) => void;
  onDragEnd?: () => void;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  const statusStyle = STATUS_STYLE[story.status];

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      draggable={!disabled}
      onClick={() => onClick?.(story.id)}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.(story.id);
        }
      }}
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", story.id);
        onDragStart?.(story.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      className={cn(
        "group w-full text-left rounded-lg border border-border/60 bg-card px-3 py-2.5",
        "hover:border-border hover:bg-card/80 transition-colors duration-150",
        "focus-ring",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      {/* Top row: key + priority */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {story.key ?? "—"}
        </span>
        <div className="flex items-center gap-0.5">
          <PriorityIndicator priority={story.priority} />
          {actions}
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-medium leading-snug text-foreground line-clamp-2 mb-2">
        {story.title}
      </p>

      {/* Metadata row: type + status + task progress */}
      <div className={STORY_CARD_LAYOUT.metadataRow} data-testid="story-card-metadata-row">
        <div className={STORY_CARD_LAYOUT.metadataLeft}>
          <StoryTypeBadge storyType={story.story_type} variant="plain" />
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              statusStyle.bg,
              "text-muted-foreground",
            )}
          >
            <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
            {STATUS_LABEL[story.status]}
          </span>
        </div>

        <span className={STORY_CARD_LAYOUT.taskProgress}>
          {story.task_count > 0 ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground",
                story.done_task_count === story.task_count && "text-emerald-400",
              )}
              title={`${story.done_task_count} of ${story.task_count} tasks done`}
            >
              <CheckCircle2 className="size-3" />
              {story.done_task_count}/{story.task_count}
            </span>
          ) : null}
        </span>
      </div>

      <StoryLabelChips labels={story.labels} className="mt-1" />
    </div>
  );
}
