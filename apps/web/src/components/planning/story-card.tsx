import {
  Bug,
  CheckCircle2,
  FlaskConical,
  Wrench,
  BookOpen,
  ChevronUp,
  ChevronDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemStatus } from "@/lib/planning/types";

export interface StoryCardStory {
  id: string;
  key: string | null;
  title: string;
  status: ItemStatus;
  priority: number | null;
  story_type: string;
  position: number;
  task_count: number;
  done_task_count: number;
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

export const TYPE_CONFIG: Record<string, { icon: typeof Bug; label: string; color: string }> = {
  BUG: { icon: Bug, label: "Bug", color: "text-red-400" },
  SPIKE: { icon: FlaskConical, label: "Spike", color: "text-cyan-400" },
  CHORE: { icon: Wrench, label: "Chore", color: "text-slate-400" },
  USER_STORY: { icon: BookOpen, label: "Story", color: "text-primary" },
};

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
}: {
  story: StoryCardStory;
  onClick?: (storyId: string) => void;
}) {
  const statusStyle = STATUS_STYLE[story.status];
  const typeConf = TYPE_CONFIG[story.story_type] ?? TYPE_CONFIG.USER_STORY;
  const TypeIcon = typeConf.icon;

  return (
    <button
      type="button"
      onClick={() => onClick?.(story.id)}
      className={cn(
        "group w-full text-left rounded-lg border border-border/60 bg-card px-3 py-2.5",
        "hover:border-border hover:bg-card/80 transition-colors duration-150",
        "focus-ring",
      )}
    >
      {/* Top row: key + priority */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {story.key ?? "—"}
        </span>
        <PriorityIndicator priority={story.priority} />
      </div>

      {/* Title */}
      <p className="text-sm font-medium leading-snug text-foreground line-clamp-2 mb-2">
        {story.title}
      </p>

      {/* Bottom row: type tag + task progress + status dot */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-1 text-[11px]", typeConf.color)}>
          <TypeIcon className="size-3" />
          {typeConf.label}
        </span>

        <div className="flex items-center gap-2">
          {story.task_count > 0 && (
            <span
              className={cn(
                "flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground",
                story.done_task_count === story.task_count && "text-emerald-400",
              )}
              title={`${story.done_task_count} of ${story.task_count} tasks done`}
            >
              <CheckCircle2 className="size-3" />
              {story.done_task_count}/{story.task_count}
            </span>
          )}

          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              statusStyle.bg,
              "text-muted-foreground"
            )}
          >
            <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
            {STATUS_LABEL[story.status]}
          </span>
        </div>
      </div>
    </button>
  );
}
