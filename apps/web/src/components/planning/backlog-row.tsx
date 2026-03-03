import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import type { StoryCardStory } from "./story-card";
import { STATUS_STYLE, STATUS_LABEL, TYPE_CONFIG } from "./story-card";
import { StoryLabelChips } from "./story-label-chips";

export const BACKLOG_ROW_LAYOUT = {
  gridTemplate: "grid-cols-[auto_72px_minmax(0,1fr)_112px_240px_112px_36px_56px]",
  actions: "w-[112px]",
  epic: "w-[240px]",
  status: "w-[112px]",
  storyPoints: "w-[36px]",
  taskProgress: "w-[56px]",
} as const;

/**
 * A single compact row in the Jira-like backlog list.
 * Columns: type icon | key | summary | epic | status pill | SP | task progress
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
  const typeConf = TYPE_CONFIG[item.story_type] ?? TYPE_CONFIG.USER_STORY;
  const TypeIcon = typeConf.icon;

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
        <p className="truncate text-sm text-foreground">{item.title}</p>
        <StoryLabelChips
          labels={item.labels}
          className="mt-1"
          chipClassName="max-w-[7rem]"
        />
      </div>

      {/* Actions */}
      <span className={cn("shrink-0 flex justify-end", BACKLOG_ROW_LAYOUT.actions)}>
        {actions}
      </span>

      {/* Epic */}
      <span className={cn("shrink-0", BACKLOG_ROW_LAYOUT.epic)}>
        {item.epic_key && item.epic_title ? (
          <Badge
            variant="outline"
            className={cn(
              "w-full justify-start gap-1.5 px-2 py-0.5 text-[10px] font-medium",
              "bg-violet-500/10 text-violet-300 border-violet-500/30",
            )}
            title={`${item.epic_key} ${item.epic_title}`}
          >
            <span className="font-mono">{item.epic_key}</span>
            <span className="truncate min-w-0">{item.epic_title}</span>
          </Badge>
        ) : null}
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
        {item.task_count > 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground",
              item.done_task_count === item.task_count && "text-emerald-400",
            )}
          >
            <CheckCircle2 className="size-3" />
            {item.done_task_count}/{item.task_count}
          </span>
        ) : null}
      </span>
    </div>
  );
}
