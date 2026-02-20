"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { Story, Task, TaskState } from "@/lib/types";
import { TASK_STATES } from "@/lib/types";

interface BoardData {
  stories: Story[];
  tasks: Task[];
}

const COLUMN_COLORS: Record<TaskState, string> = {
  PLANNED: "border-t-neutral-500",
  ASSIGNED: "border-t-blue-500",
  DONE: "border-t-green-500",
  BLOCKED: "border-t-red-500",
};

const COLUMN_HEADER_COLORS: Record<TaskState, string> = {
  PLANNED: "text-neutral-400",
  ASSIGNED: "text-blue-400",
  DONE: "text-green-400",
  BLOCKED: "text-red-400",
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
  const { data } = useAutoRefresh<BoardData>({
    url: "/api/board",
    initialData,
  });

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

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      {columns.map(({ state, grouped, count }) => (
        <div key={state} className="flex flex-col gap-3">
          <div
            className={`flex items-center justify-between border-t-2 pt-3 ${COLUMN_COLORS[state]}`}
          >
            <h3
              className={`text-sm font-semibold uppercase tracking-wider ${COLUMN_HEADER_COLORS[state]}`}
            >
              {state}
            </h3>
            <Badge variant="secondary" className="text-xs">
              {count}
            </Badge>
          </div>

          {Array.from(grouped.entries()).map(([storyId, storyTasks]) => (
            <div key={storyId} className="space-y-2">
              <p className="text-xs font-mono text-muted-foreground px-1">
                {storyId}
              </p>
              {storyTasks.map((task) => (
                <Link
                  key={task.task_id}
                  href={`/tasks/${task.story_id}/${task.task_id}`}
                >
                  <Card
                    className={`border-l-2 transition-colors hover:border-primary/50 cursor-pointer ${getStoryColor(
                      task.story_id,
                      storyIds
                    )}`}
                  >
                    <CardHeader className="p-3">
                      <CardTitle className="font-mono text-xs">
                        {task.task_id}
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-2 mt-1">
                        {task.objective.split("\n")[0].slice(0, 80)}
                        {task.objective.split("\n")[0].length > 80 ? "…" : ""}
                      </CardDescription>
                      <div className="mt-2">
                        <Badge variant="outline" className="text-[10px]">
                          {task.worker_type}
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          ))}

          {count === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No tasks
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
