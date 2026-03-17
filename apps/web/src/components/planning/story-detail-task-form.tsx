"use client";

import { CheckCircle2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_LABEL, STATUS_STYLE } from "./story-card";
import type { TaskItem } from "./story-types";
import { TASK_TYPE_OPTIONS, type TaskDraft } from "./story-detail-view-model";

// ── TaskRow ─────────────────────────────────────────────────────────────────

export interface TaskRowProps {
  task: TaskItem;
  pending: boolean;
  onEdit: (trigger: HTMLButtonElement) => void;
  onMarkDone: () => void;
  onDelete: () => void;
}

export function TaskRow({ task, pending, onEdit, onMarkDone, onDelete }: TaskRowProps) {
  const statusStyle = STATUS_STYLE[task.status];

  return (
    <div
      className={cn(
        "grid items-center gap-3 px-3 py-2.5",
        "grid-cols-[72px_minmax(0,1fr)_112px_88px_168px]",
        task.is_blocked && "bg-red-500/5",
      )}
    >
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
        {task.key ?? "\u2014"}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        {task.objective && (
          <p className="truncate text-xs text-muted-foreground">{task.objective}</p>
        )}
      </div>

      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          statusStyle.bg,
          statusStyle.text,
        )}
      >
        {STATUS_LABEL[task.status]}
      </span>

      <span className="text-xs text-muted-foreground tabular-nums">
        {task.priority !== null ? `P${task.priority}` : "\u2014"}
      </span>

      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={(event) => onEdit(event.currentTarget)}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={pending || task.status === "DONE"}
          onClick={onMarkDone}
        >
          <CheckCircle2 className="size-3" />
          Done
        </Button>
        <Button
          type="button"
          size="xs"
          variant="destructive"
          aria-label="Delete task"
          disabled={pending}
          onClick={onDelete}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center">
                <Trash2 className="size-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Delete task</TooltipContent>
          </Tooltip>
        </Button>
      </div>
    </div>
  );
}

// ── TaskForm ────────────────────────────────────────────────────────────────

export interface TaskFormProps {
  draft: TaskDraft;
  disabled: boolean;
  onUpdate: (field: keyof TaskDraft, value: string) => void;
}

export function TaskForm({ draft, disabled, onUpdate }: TaskFormProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <label className="text-xs text-muted-foreground">Title</label>
        <input
          value={draft.title}
          onChange={(event) => onUpdate("title", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        />
      </div>

      <div className="space-y-1 sm:col-span-2">
        <label className="text-xs text-muted-foreground">Objective</label>
        <textarea
          value={draft.objective}
          onChange={(event) => onUpdate("objective", event.target.value)}
          disabled={disabled}
          rows={3}
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus-ring"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Type</label>
        <select
          value={draft.task_type}
          onChange={(event) => onUpdate("task_type", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        >
          {TASK_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Priority</label>
        <input
          type="number"
          min={1}
          max={9}
          value={draft.priority}
          onChange={(event) => onUpdate("priority", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Estimate (pts)</label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={draft.estimate_points}
          onChange={(event) => onUpdate("estimate_points", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Due date</label>
        <input
          type="date"
          value={draft.due_at}
          onChange={(event) => onUpdate("due_at", event.target.value)}
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm focus-ring"
        />
      </div>
    </div>
  );
}
