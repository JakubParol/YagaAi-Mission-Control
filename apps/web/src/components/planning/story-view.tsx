import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  ShieldAlert,
} from "lucide-react";

import type { ItemStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_STYLE,
  STATUS_LABEL,
  TYPE_CONFIG,
} from "./story-card";

// ─── Types ──────────────────────────────────────────────────────────

export interface StoryDetail {
  id: string;
  project_id: string | null;
  epic_id: string | null;
  key: string | null;
  title: string;
  intent: string | null;
  description: string | null;
  story_type: string;
  status: ItemStatus;
  status_mode: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  priority: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  task_count: number;
}

export interface TaskItem {
  id: string;
  key: string | null;
  title: string;
  objective: string | null;
  status: ItemStatus;
  priority: number | null;
  is_blocked: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function PriorityLabel({ priority }: { priority: number | null }) {
  if (priority === null) return <span className="text-muted-foreground">—</span>;
  if (priority <= 2) return <span className="text-red-400 font-medium">Critical ({priority})</span>;
  if (priority <= 4) return <span className="text-amber-400 font-medium">High ({priority})</span>;
  if (priority <= 6) return <span className="text-slate-300">Medium ({priority})</span>;
  return <span className="text-blue-400">Low ({priority})</span>;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-b-0">
      <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground pt-0.5">
        {label}
      </span>
      <div className="text-sm text-foreground min-w-0">{children}</div>
    </div>
  );
}

function TaskStatusIcon({ status }: { status: ItemStatus }) {
  if (status === "DONE") {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />;
  }
  if (status === "IN_PROGRESS" || status === "CODE_REVIEW" || status === "VERIFY") {
    const style = STATUS_STYLE[status];
    return <Circle className={cn("size-4 shrink-0", style.text)} />;
  }
  return <Circle className="size-4 shrink-0 text-muted-foreground/50" />;
}

function TaskList({ tasks }: { tasks: TaskItem[] }) {
  if (tasks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-3">
        No tasks defined for this story.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={cn(
            "flex items-start gap-3 rounded-md border border-border/40 px-3 py-2.5",
            task.is_blocked && "border-red-500/30 bg-red-500/5",
          )}
        >
          <TaskStatusIcon status={task.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              {task.key && (
                <span className="font-mono text-[11px] tracking-wide text-muted-foreground shrink-0">
                  {task.key}
                </span>
              )}
              <span className="text-sm font-medium text-foreground truncate">
                {task.title}
              </span>
            </div>
            {task.objective && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {task.objective}
              </p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
              STATUS_STYLE[task.status].bg,
              STATUS_STYLE[task.status].text,
            )}
          >
            {STATUS_LABEL[task.status]}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function StoryView({
  story,
  tasks,
  headerActions,
}: {
  story: StoryDetail;
  tasks: TaskItem[];
  headerActions?: React.ReactNode;
}) {
  const statusStyle = STATUS_STYLE[story.status];
  const typeConf = TYPE_CONFIG[story.story_type] ?? TYPE_CONFIG.USER_STORY;
  const TypeIcon = typeConf.icon;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tracking-wide text-muted-foreground">
            {story.key ?? "—"}
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              statusStyle.bg,
              statusStyle.text,
            )}
          >
            <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
            {STATUS_LABEL[story.status]}
          </span>
          {headerActions && <div className="ml-auto">{headerActions}</div>}
        </div>
        <h1 className="text-xl leading-none font-semibold">{story.title}</h1>
        {story.intent && (
          <p className="text-muted-foreground text-sm italic">{story.intent}</p>
        )}
      </div>

      {/* Blocked banner */}
      {story.is_blocked && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <ShieldAlert className="size-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">Blocked</span>
            {story.blocked_reason && (
              <span className="text-red-400/80"> — {story.blocked_reason}</span>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {story.description && (
        <div className="rounded-md border border-border/40 bg-muted/20 px-4 py-3">
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {story.description}
          </p>
        </div>
      )}

      {/* Tasks */}
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <ListTodo className="size-4 text-muted-foreground" />
          Tasks
          <span className="text-xs font-normal text-muted-foreground">
            ({tasks.length})
          </span>
        </h3>
        <TaskList tasks={tasks} />
      </div>

      {/* Metadata grid */}
      <div className="space-y-0">
        <MetaRow label="Type">
          <span className={cn("flex items-center gap-1.5", typeConf.color)}>
            <TypeIcon className="size-3.5" />
            {typeConf.label}
          </span>
        </MetaRow>

        <MetaRow label="Priority">
          <PriorityLabel priority={story.priority} />
        </MetaRow>

        <MetaRow label="Status mode">
          <Badge variant="secondary" className="text-[10px] uppercase">
            {story.status_mode}
          </Badge>
        </MetaRow>

        <MetaRow label="Created">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="size-3.5" />
            {formatDate(story.created_at)}
          </span>
        </MetaRow>

        {story.started_at && (
          <MetaRow label="Started">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5" />
              {formatDateTime(story.started_at)}
            </span>
          </MetaRow>
        )}

        {story.completed_at && (
          <MetaRow label="Completed">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Clock className="size-3.5" />
              {formatDateTime(story.completed_at)}
            </span>
          </MetaRow>
        )}

        <MetaRow label="Updated">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" />
            {formatDateTime(story.updated_at)}
          </span>
        </MetaRow>
      </div>
    </div>
  );
}
