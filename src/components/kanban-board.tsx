"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { EmptyState } from "./empty-state";
import { ErrorCard } from "./error-card";
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

/** Assign a deterministic color to each story for visual grouping. */
const STORY_COLORS = [
  "border-l-violet-500",
  "border-l-cyan-500",
  "border-l-amber-500",
  "border-l-rose-500",
  "border-l-emerald-500",
  "border-l-sky-500",
];

function getStoryColor(storyId: string, storyIds: string[]): string {
  const idx = storyIds.indexOf(storyId);
  return STORY_COLORS[idx % STORY_COLORS.length];
}

export function KanbanBoard({ initialData }: { initialData: BoardData }) {
  const { data, error } = useAutoRefresh<BoardData>({
    url: "/api/board",
    initialData,
  });

  if (error) {
    return (
      <ErrorCard
        title="Connection Error"
        message={error}
        suggestion="Verify that SUPERVISOR_SYSTEM_PATH is set correctly and the path is accessible."
      />
    );
  }

  const { tasks } = data;
  const storyIds = [...new Set(tasks.map((t) => t.story_id))].sort();

  // Group tasks by state, then by story
  const columns = TASK_STATES.map((state) => {
    const stateTasks = tasks.filter((t) => t.state === state);
    const grouped = new Map<string, Task[]>();
    for (const task of stateTasks) {
      const list = grouped.get(task.story_id) || [];
      list.push(task);
      grouped.set(task.story_id, list);
    }
    return { state, grouped, count: stateTasks.length };
  });

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="Board is empty"
        description="Tasks from all stories will appear here organized by state. Create stories and decompose them into tasks to populate the board."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
      {columns.map(({ state, grouped, count }) => (
        <div key={state} className="flex flex-col gap-3">
          <div
            className={`flex items-center justify-between border-t-2 pt-3 ${COLUMN_COLORS[state]}`}
          >
            <h3
              className={`text-sm font-semibold uppercase tracking-wider ${COLUMN_HEADER_COLORS[state]}`}
            >
              {COLUMN_LABELS[state]}
            </h3>
            <Badge variant="secondary" className="text-xs">
              {count}
            </Badge>
          </div>

          {Array.from(grouped.entries()).map(([storyId, storyTasks]) => (
            <div key={storyId} className="space-y-2">
              <p className="text-xs font-mono text-[#94a3b8] px-1">
                {storyId}
              </p>
              {storyTasks.map((task) => (
                <Link
                  key={task.task_id}
                  href={`/tasks/${task.story_id}/${task.task_id}`}
                >
                  <div
                    className={`rounded-xl border border-[#1f2937] bg-[#0b1220] p-3 border-l-2 transition-all duration-200 hover:border-[#ec8522]/50 hover:shadow-lg hover:shadow-[#ec8522]/5 cursor-pointer ${getStoryColor(
                      task.story_id,
                      storyIds
                    )}`}
                  >
                    <p className="font-mono text-xs font-semibold text-[#e2e8f0]">
                      {task.task_id}
                    </p>
                    <p className="text-xs text-[#94a3b8] line-clamp-2 mt-1">
                      {task.objective.split("\n")[0].slice(0, 80)}
                      {task.objective.split("\n")[0].length > 80 ? "…" : ""}
                    </p>
                    <div className="mt-2">
                      <span className="inline-flex items-center rounded-full border border-[#1f2937] bg-[#0f172a] px-2 py-0.5 text-[10px] font-medium text-[#94a3b8]">
                        {task.worker_type}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ))}

          {count === 0 && (
            <p className="text-xs text-[#94a3b8] text-center py-8">
              No {COLUMN_LABELS[state].toLowerCase()} tasks
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
