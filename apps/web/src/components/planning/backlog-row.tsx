import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import type { StoryCardStory } from "./story-card";
import { STATUS_STYLE, STATUS_LABEL, TYPE_CONFIG } from "./story-card";

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
        "group grid w-full grid-cols-[auto_72px_minmax(0,1fr)_112px_240px_112px_36px_56px] items-center gap-3 px-3 py-2 text-left",
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
      <span className="text-sm text-foreground truncate min-w-0 flex-1">
        {item.title}
      </span>

      {/* Actions */}
      <span className="shrink-0 w-[112px] flex justify-end">
        {actions}
      </span>

      {/* Epic */}
      <span className="shrink-0 w-[240px]">
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
      <span className="w-[112px] shrink-0">
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
      <span className="shrink-0 w-[36px] text-center text-[11px] text-muted-foreground">
        -
      </span>

      {/* Task progress */}
      <span className="shrink-0 w-[52px] text-right">
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
