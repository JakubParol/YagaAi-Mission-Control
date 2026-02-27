"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ListTodo, Archive, Clock, UserCheck, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StateBadge, ParseErrorBadge } from "@/components/state-badge";
import { EmptyState } from "@/components/empty-state";
import { ErrorCard } from "@/components/error-card";
import { StatCard, StatCardsRow } from "@/components/stat-card";
import { apiUrl } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { SupervisorStory, SupervisorTask, TaskState } from "@/lib/types";

interface StoryDetailData {
  story: SupervisorStory;
  tasks: SupervisorTask[];
}

export function StoryDetail({
  storyId,
  initialData,
}: {
  storyId: string;
  initialData: StoryDetailData;
}) {
  const { data, error } = useAutoRefresh<StoryDetailData>({
    url: apiUrl(`/v1/observability/supervisor/stories/${storyId}`),
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

  const { story, tasks } = data;

  // Compute task counts per state
  const counts: Record<TaskState, number> = {
    BACKLOG: 0, PLANNED: 0, ASSIGNED: 0, DONE: 0, BLOCKED: 0,
  };
  for (const t of tasks) {
    counts[t.state]++;
  }

  return (
    <div>
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-1.5 text-sm">
          <li>
            <Link
              href="/planning/stories"
              className="focus-ring rounded text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              Stories
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40 select-none">/</li>
          <li aria-current="page" className="font-mono text-foreground">
            {story.id}
          </li>
        </ol>
      </nav>

      {/* Stat cards */}
      <StatCardsRow>
        <StatCard label="Total Tasks" value={tasks.length} icon={ListTodo} iconColor="text-primary" iconBg="bg-primary/10" />
        <StatCard label="Backlog" value={counts.BACKLOG} icon={Archive} iconColor="text-slate-400" iconBg="bg-slate-500/10" />
        <StatCard label="Planned" value={counts.PLANNED} icon={Clock} iconColor="text-gray-400" iconBg="bg-gray-500/10" />
        <StatCard label="Assigned" value={counts.ASSIGNED} icon={UserCheck} iconColor="text-amber-400" iconBg="bg-amber-500/10" />
        <StatCard label="Done" value={counts.DONE} icon={CheckCircle} iconColor="text-green-400" iconBg="bg-green-500/10" />
      </StatCardsRow>

      {/* Story content */}
      <div className="prose prose-invert prose-sm max-w-none mb-8 prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {story.content}
        </ReactMarkdown>
      </div>

      {/* Separator */}
      <hr className="border-border my-8" />

      {/* Tasks */}
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Tasks
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({tasks.length})
        </span>
      </h2>

      {tasks.length === 0 ? (
        <EmptyState
          icon="tasks"
          title="No tasks for this story"
          description="Tasks will appear here once they are decomposed from the story. The Supervisor creates tasks in the TASKS/ directory."
        />
      ) : (
        <div role="list" className="space-y-2">
          {tasks.map((task) => (
            <Link
              key={task.task_id}
              href={`/planning/tasks/${task.story_id}/${task.task_id}`}
              role="listitem"
              aria-label={`Task ${task.task_id}, state: ${task.state}${task.parseError ? ", parse error" : ""}`}
              className={cn(
                "focus-ring block rounded-lg border border-border bg-card p-4",
                "transition-colors duration-150",
                "hover:border-primary/40 hover:bg-white/[0.02]",
                task.parseError && "border-red-500/30"
              )}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {task.task_id}
                </span>
                <StateBadge state={task.state} />
                {task.parseError ? (
                  <ParseErrorBadge error={task.parseError} />
                ) : (
                  <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {task.worker_type}
                  </span>
                )}
              </div>
              {task.parseError ? (
                <p className="mt-2 line-clamp-2 text-sm text-red-400/80">
                  {task.parseError}
                </p>
              ) : (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {task.objective.split("\n")[0]}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
