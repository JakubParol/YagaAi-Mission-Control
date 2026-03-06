import type { DragEvent, ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Minus,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import type { ItemStatus } from "@/lib/planning/types";
import { StoryLabelChips, type StoryLabel } from "./story-label-chips";
import { StoryEpicDisplay } from "./story-epic-display";
import { StoryTaskProgress } from "./story-task-progress";
import {
  STORY_TYPE_CONFIG,
  resolveStoryTypeVisualConfig,
} from "./story-type-badge";

export interface StoryCardStory {
  id: string;
  key: string | null;
  title: string;
  status: ItemStatus;
  priority: number | null;
  story_type: string;
  epic_id?: string | null;
  epic_key?: string | null;
  epic_title?: string | null;
  position: number;
  task_count: number;
  done_task_count: number;
  labels?: StoryLabel[];
  label_ids?: string[];
  assignee?: {
    name?: string | null;
    last_name?: string | null;
    initials?: string | null;
    avatar?: string | null;
  } | null;
  assignee_agent_id?: string | null;
  current_assignee_agent_id?: string | null;
  assignee_name?: string | null;
  assignee_last_name?: string | null;
  assignee_initials?: string | null;
  assignee_avatar?: string | null;
}

export const TYPE_CONFIG = STORY_TYPE_CONFIG;

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

export const STORY_CARD_LAYOUT = {
  metadataRow: "flex items-center justify-between gap-2",
  metadataLeft: "flex min-w-0 items-center gap-1.5",
  metadataRight: "flex items-center gap-2.5",
  actions: "absolute right-2 top-2 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
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

function resolveStoryAssignee(story: StoryCardStory): StoryCardStory["assignee"] | null {
  if (story.assignee) return story.assignee;
  if (
    story.assignee_name
    || story.assignee_last_name
    || story.assignee_initials
    || story.assignee_avatar
  ) {
    return {
      name: story.assignee_name ?? null,
      last_name: story.assignee_last_name ?? null,
      initials: story.assignee_initials ?? null,
      avatar: story.assignee_avatar ?? null,
    };
  }
  return null;
}

export function StoryCard({
  story,
  onClick,
  onDragStart,
  onDragEnd,
  disabled = false,
  actions,
  assigneeControl,
}: {
  story: StoryCardStory;
  onClick?: (storyId: string) => void;
  onDragStart?: (storyId: string) => void;
  onDragEnd?: () => void;
  disabled?: boolean;
  actions?: ReactNode;
  assigneeControl?: ReactNode;
}) {
  const typeConfig = resolveStoryTypeVisualConfig(story.story_type);
  const TypeIcon = typeConfig.icon;
  const assignee = resolveStoryAssignee(story);
  const assigneeName = assignee?.name?.trim() ?? "Unassigned";
  const hasAssignee = Boolean(
    assignee && (assignee.name || assignee.initials || assignee.avatar),
  );

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
        "group relative w-full text-left rounded-lg border border-border/60 bg-card px-3 py-2.5",
        "hover:border-border hover:bg-card/80 transition-colors duration-150",
        "focus-ring",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      {actions ? (
        <div className={STORY_CARD_LAYOUT.actions} aria-hidden={disabled ? true : undefined}>
          {actions}
        </div>
      ) : null}

      {/* Title */}
      <p className="pr-8 text-sm font-medium leading-snug text-foreground line-clamp-2 mb-1">
        {story.title}
      </p>

      {/* Epic */}
      <div className="mb-1.5 min-h-4">
        <StoryEpicDisplay
          epicKey={story.epic_key}
          epicTitle={story.epic_title}
          emptyLabel="No epic"
          className="w-full"
        />
      </div>

      {/* Metadata row: type + key | tasks + priority + story points + assignee */}
      <div className={STORY_CARD_LAYOUT.metadataRow} data-testid="story-card-metadata-row">
        <div className={STORY_CARD_LAYOUT.metadataLeft}>
          <TypeIcon className={cn("size-3.5 shrink-0", typeConfig.color)} aria-hidden="true" />
          <span className="truncate font-mono text-[11px] tracking-wide text-muted-foreground">
            {story.key ?? "—"}
          </span>
        </div>

        <div className={STORY_CARD_LAYOUT.metadataRight}>
          <StoryTaskProgress
            doneCount={story.done_task_count}
            totalCount={story.task_count}
          />
          <PriorityIndicator priority={story.priority} />
          <span className="text-[11px] text-muted-foreground" title="Story points">
            -
          </span>
          {assigneeControl ?? (
            hasAssignee ? (
              <Avatar
                src={assignee?.avatar}
                name={assignee?.name ?? null}
                lastName={assignee?.last_name ?? null}
                initials={assignee?.initials ?? null}
                alt={`${assigneeName} assignee avatar`}
                className="size-5"
              />
            ) : (
              <span
                className="inline-flex size-5 items-center justify-center rounded-full border border-border/70 bg-muted text-muted-foreground"
                title="Unassigned"
                aria-label="Unassigned"
              >
                <User className="size-3" aria-hidden="true" />
              </span>
            )
          )}
        </div>
      </div>

      <StoryLabelChips labels={story.labels} className="mt-1" />
    </div>
  );
}
