import type { ReactNode } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoryCardStory } from "./story-card";
import { STATUS_STYLE, STATUS_LABEL } from "./story-card";
import { AssigneeAvatarTooltip } from "./assignee-avatar-tooltip";
import { StoryEpicDisplay } from "./story-epic-display";
import { StoryLabelChips } from "./story-label-chips";
import { StoryTaskProgress } from "./story-task-progress";
import { resolveStoryTypeVisualConfig } from "./story-type-badge";

export const BACKLOG_ROW_LAYOUT = {
  gridTemplate: "grid-cols-[auto_72px_minmax(0,1fr)_240px_112px_36px_56px_72px_56px]",
  actions: "w-[56px]",
  epic: "w-[240px]",
  status: "w-[112px]",
  storyPoints: "w-[36px]",
  taskProgress: "w-[56px]",
  assignee: "w-[72px]",
} as const;

/**
 * A single compact row in the Jira-like backlog list.
 * Columns: type icon | key | summary | epic | status pill | SP | task progress | assignee | actions
 */
export function BacklogRow({
  item,
  onClick,
  actions,
}: {
  item: StoryCardStory;
  onClick?: (id: string) => void;
  actions?: ReactNode;
}) {
  const statusStyle = STATUS_STYLE[item.status];
  const typeConf = resolveStoryTypeVisualConfig(item.story_type);
  const TypeIcon = typeConf.icon;
  const assignee = item.assignee ?? (
    item.assignee_name || item.assignee_last_name || item.assignee_initials || item.assignee_avatar
      ? {
          name: item.assignee_name ?? null,
          last_name: item.assignee_last_name ?? null,
          initials: item.assignee_initials ?? null,
          avatar: item.assignee_avatar ?? null,
        }
      : null
  );
  const assigneeName = assignee?.name?.trim() ?? "Unassigned";
  const hasAssignee = Boolean(
    assignee && (assignee.name || assignee.initials || assignee.avatar),
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.(item.id);
        }
      }}
      className={cn(
        "group grid w-full items-center gap-3 px-3 py-2 text-left",
        BACKLOG_ROW_LAYOUT.gridTemplate,
        "hover:bg-muted/30 transition-colors duration-100",
        "cursor-pointer",
        "focus-ring",
      )}
    >
      {/* Type icon */}
      <TypeIcon
        className={cn("size-4 shrink-0", typeConf.color)}
        aria-label={typeConf.label}
      />

      {/* Key */}
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground shrink-0 w-[72px]">
        {item.key ?? "—"}
      </span>

      {/* Summary */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground" title={item.title}>
          {item.title}
        </p>
        <StoryLabelChips
          labels={item.labels}
          className="mt-1"
          chipClassName="max-w-[7rem]"
        />
      </div>

      {/* Epic */}
      <span className={cn("shrink-0", BACKLOG_ROW_LAYOUT.epic)}>
        <StoryEpicDisplay
          epicKey={item.epic_key}
          epicTitle={item.epic_title}
          className="w-full"
        />
      </span>

      {/* Status pill */}
      <span className={cn("shrink-0", BACKLOG_ROW_LAYOUT.status)}>
        <span
          className={cn(
            "inline-flex w-full items-center justify-start gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
            statusStyle.bg,
            statusStyle.text,
          )}
        >
          <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
          {STATUS_LABEL[item.status]}
        </span>
      </span>

      {/* SP */}
      <span className={cn("shrink-0 text-center text-[11px] text-muted-foreground", BACKLOG_ROW_LAYOUT.storyPoints)}>
        -
      </span>

      {/* Task progress */}
      <span className={cn("shrink-0 text-right", BACKLOG_ROW_LAYOUT.taskProgress)}>
        <StoryTaskProgress
          doneCount={item.done_task_count}
          totalCount={item.task_count}
        />
      </span>

      {/* Assignee */}
      <span className={cn("shrink-0 flex justify-center", BACKLOG_ROW_LAYOUT.assignee)}>
        {hasAssignee ? (
          <span className="group/assignee relative inline-flex items-center">
            <AssigneeAvatarTooltip
              name={assigneeName}
              lastName={assignee?.last_name ?? null}
              initials={assignee?.initials ?? null}
              avatar={assignee?.avatar ?? null}
            />
          </span>
        ) : (
          <span className="inline-flex size-5 items-center justify-center rounded-full border border-border/70 bg-muted text-muted-foreground" title="Unassigned" aria-label="Unassigned">
            <User className="size-3" aria-hidden="true" />
          </span>
        )}
      </span>

      {/* Actions */}
      <span className={cn("shrink-0 flex justify-end", BACKLOG_ROW_LAYOUT.actions)}>
        {actions}
      </span>
    </div>
  );
}
