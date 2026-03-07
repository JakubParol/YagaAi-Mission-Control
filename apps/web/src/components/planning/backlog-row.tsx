import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StoryCardStory } from "./story-card";
import { STATUS_STYLE, STATUS_LABEL } from "./story-card";
import { StoryEpicDisplay } from "./story-epic-display";
import { StoryLabelChips } from "./story-label-chips";
import { StoryTaskProgress } from "./story-task-progress";
import { resolveStoryTypeVisualConfig } from "./story-type-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  StoryAssigneeControl,
  type StoryAssigneeOption,
  type StoryAssigneeSelection,
} from "./story-assignee-control";

export const BACKLOG_ROW_LAYOUT = {
  gridTemplate: "grid-cols-[20px_72px_minmax(0,1fr)_96px_240px_112px_36px_56px_72px_56px]",
  actions: "w-[56px]",
  labels: "w-[96px]",
  epic: "w-[240px]",
  status: "w-[112px]",
  storyPoints: "w-[36px]",
  taskProgress: "w-[56px]",
  assignee: "w-[72px]",
} as const;

export type BacklogAssigneeOption = StoryAssigneeOption;

/**
 * A single compact row in the Jira-like backlog list.
 * Columns: type icon | key | summary | labels | epic | status pill | SP | task progress | assignee | actions
 */
export function BacklogRow({
  item,
  onClick,
  actions,
  assigneeOptions,
  onAssigneeChange,
  assigneePending = false,
}: {
  item: StoryCardStory;
  onClick?: (id: string) => void;
  actions?: ReactNode;
  assigneeOptions?: readonly StoryAssigneeOption[];
  onAssigneeChange?: (storyId: string, nextAssigneeAgentId: string | null) => void;
  assigneePending?: boolean;
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
  const selectedAssigneeId = item.current_assignee_agent_id ?? item.assignee_agent_id ?? null;
  const currentAssignee: StoryAssigneeSelection = {
    assignee_agent_id: selectedAssigneeId,
    assignee_name: assignee?.name ?? null,
    assignee_last_name: assignee?.last_name ?? null,
    assignee_initials: assignee?.initials ?? null,
    assignee_avatar: assignee?.avatar ?? null,
  };

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
      <div className="min-w-0 flex-1 overflow-hidden">
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">
              {item.title}
            </p>
          </TooltipTrigger>
          <TooltipContent side="bottom">{item.title}</TooltipContent>
        </Tooltip>
      </div>

      {/* Labels */}
      <span className={cn("shrink-0", BACKLOG_ROW_LAYOUT.labels)}>
        <StoryLabelChips
          labels={item.labels}
          maxVisible={1}
          allNamesTooltip
          className="min-w-0 max-w-full"
          chipClassName="max-w-[5.5rem]"
        />
      </span>

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
        <StoryAssigneeControl
          storyId={item.id}
          currentAssignee={currentAssignee}
          assigneeOptions={assigneeOptions ?? []}
          disabled={assigneePending}
          onChange={(_, nextAssignee) => {
            const nextAssigneeAgentId = nextAssignee.assignee_agent_id;
            if (!onAssigneeChange) return;
            if (nextAssigneeAgentId === selectedAssigneeId) return;
            onAssigneeChange(item.id, nextAssigneeAgentId);
          }}
        />
      </span>

      {/* Actions */}
      <span className={cn("shrink-0 flex justify-end", BACKLOG_ROW_LAYOUT.actions)}>
        {actions}
      </span>
    </div>
  );
}
