"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { EmptyState } from "./empty-state";
import { ErrorCard } from "./error-card";
import { ParseErrorBadge } from "./state-badge";
import type { Story, Task, TaskState } from "@/lib/types";
import { TASK_STATES } from "@/lib/types";

interface BoardData {
  stories: Story[];
  tasks: Task[];
}

const COLUMN_COLORS: Record<TaskState, string> = {
  BACKLOG: "border-t-slate-500",
  PLANNED: "border-t-gray-400",
  ASSIGNED: "border-t-amber-500",
  DONE: "border-t-green-500",
  BLOCKED: "border-t-red-500",
};

const COLUMN_HEADER_COLORS: Record<TaskState, string> = {
  BACKLOG: "text-slate-400",
  PLANNED: "text-gray-400",
  ASSIGNED: "text-amber-400",
  DONE: "text-green-400",
  BLOCKED: "text-red-400",
};

const COLUMN_LABELS: Record<TaskState, string> = {
  BACKLOG: "Backlog",
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  DONE: "Done",
  BLOCKED: "Blocked",
};

const STORY_COLORS = [
  "border-l-violet-500",
  "border-l-cyan-500",
  "border-l-amber-500",
  "border-l-rose-500",
  "border-l-emerald-500",
  "border-l-sky-500",
];

export function KanbanBoard({ initialData }: { initialData: BoardData }) {
  const { data, error } = useAutoRefresh<BoardData>({
    url: "/api/board",
    initialData,
  });

  const { tasks } = data;

  // Memoize expensive grouping computations — O(n) Map lookup replaces O(n) indexOf
  const { storyColorMap, columns } = useMemo(() => {
    const uniqueStoryIds = [...new Set(tasks.map((t) => t.story_id))].sort();
    const colorMap = new Map<string, string>();
    for (let i = 0; i < uniqueStoryIds.length; i++) {
      colorMap.set(uniqueStoryIds[i], STORY_COLORS[i % STORY_COLORS.length]);
    }

    const cols = TASK_STATES.map((state) => {
      const stateTasks = tasks.filter((t) => t.state === state);
      const grouped = new Map<string, Task[]>();
      for (const task of stateTasks) {
        const list = grouped.get(task.story_id) ?? [];
        list.push(task);
        grouped.set(task.story_id, list);
      }
      return { state, grouped, count: stateTasks.length };
    });

    return { storyColorMap: colorMap, columns: cols };
  }, [tasks]);

  if (error) {
    return (
      <ErrorCard
        title="Connection Error"
        message={error}
        suggestion="Verify that SUPERVISOR_SYSTEM_PATH is set correctly and the path is accessible."
      />
    );
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="board"
        title="Board is empty"
        description="Tasks from all stories will appear here organized by state. Create stories and decompose them into tasks to populate the board."
      />
    );
  }

  return (
    <div
      role="region"
      aria-label="Kanban board"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5"
    >
      {columns.map(({ state, grouped, count }) => (
        <section key={state} aria-label={`${COLUMN_LABELS[state]} column`} className="flex flex-col gap-3">
          <div
            className={cn(
              "flex items-center justify-between border-t-2 pt-3",
              COLUMN_COLORS[state]
            )}
          >
            <h3
              className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                COLUMN_HEADER_COLORS[state]
              )}
            >
              {COLUMN_LABELS[state]}
            </h3>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {count}
            </Badge>
          </div>

          {Array.from(grouped.entries()).map(([storyId, storyTasks]) => (
            <div key={storyId} className="space-y-2">
              <p className="truncate px-1 font-mono text-xs text-muted-foreground">
                {storyId}
              </p>
              {storyTasks.map((task) => (
                <Link
                  key={task.task_id}
                  href={`/tasks/${task.story_id}/${task.task_id}`}
                  aria-label={`Task ${task.task_id}: ${task.parseError ? "Parse error" : task.objective.split("\n")[0].slice(0, 60)}`}
                  className={cn(
                    "focus-ring block rounded-lg border border-border bg-card p-3 border-l-2",
                    "transition-colors duration-150",
                    "hover:border-primary/40 hover:bg-white/[0.02]",
                    task.parseError && "border-red-500/30",
                    storyColorMap.get(task.story_id)
                  )}
                >
                  <p className="font-mono text-xs font-semibold text-foreground">
                    {task.task_id}
                  </p>
                  {task.parseError ? (
                    <div className="mt-1">
                      <ParseErrorBadge error={task.parseError} />
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {task.objective.split("\n")[0].slice(0, 80)}
                        {task.objective.split("\n")[0].length > 80 ? "\u2026" : ""}
                      </p>
                      <div className="mt-2">
                        <span className="inline-flex items-center rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {task.worker_type}
                        </span>
                      </div>
                    </>
                  )}
                </Link>
              ))}
            </div>
          ))}

          {count === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No {COLUMN_LABELS[state].toLowerCase()} tasks
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
