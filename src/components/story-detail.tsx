"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ListTodo, Archive, Clock, UserCheck, CheckCircle, AlertTriangle } from "lucide-react";
import { StateBadge } from "@/components/state-badge";
import { EmptyState } from "@/components/empty-state";
import { ErrorCard } from "@/components/error-card";
import { StatCard, StatCardsRow } from "@/components/stat-card";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { Story, Task, TaskState } from "@/lib/types";

interface StoryDetailData {
  story: Story;
  tasks: Task[];
}

export function StoryDetail({
  storyId,
  initialData,
}: {
  storyId: string;
  initialData: StoryDetailData;
}) {
  const { data, error } = useAutoRefresh<StoryDetailData>({
    url: `/api/stories/${storyId}`,
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
      <nav className="mb-6 text-sm text-[#94a3b8]">
        <Link href="/" className="hover:text-[#e2e8f0] transition-colors duration-200">
          Stories
        </Link>
        <span className="mx-2 text-[#1f2937]">/</span>
        <span className="text-[#e2e8f0] font-mono">{story.id}</span>
      </nav>

      {/* Stat cards */}
      <StatCardsRow>
        <StatCard label="Total Tasks" value={tasks.length} icon={ListTodo} iconColor="text-[#ec8522]" iconBg="bg-[#ec8522]/10" />
        <StatCard label="Backlog" value={counts.BACKLOG} icon={Archive} iconColor="text-slate-400" iconBg="bg-slate-500/10" />
        <StatCard label="Planned" value={counts.PLANNED} icon={Clock} iconColor="text-gray-400" iconBg="bg-gray-500/10" />
        <StatCard label="Assigned" value={counts.ASSIGNED} icon={UserCheck} iconColor="text-amber-400" iconBg="bg-amber-500/10" />
        <StatCard label="Done" value={counts.DONE} icon={CheckCircle} iconColor="text-green-400" iconBg="bg-green-500/10" />
      </StatCardsRow>

      {/* Story content */}
      <div className="prose prose-invert prose-sm max-w-none mb-8 prose-headings:text-[#e2e8f0] prose-p:text-[#94a3b8] prose-strong:text-[#e2e8f0] prose-a:text-[#ec8522]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {story.content}
        </ReactMarkdown>
      </div>

      {/* Separator */}
      <div className="border-t border-[#1f2937] my-8" />

      {/* Tasks */}
      <h2 className="text-xl font-semibold text-[#e2e8f0] mb-4">
        Tasks ({tasks.length})
      </h2>

      {tasks.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No tasks for this story"
          description="Tasks will appear here once they are decomposed from the story. The Supervisor creates tasks in the TASKS/ directory."
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.task_id}
              href={`/tasks/${task.story_id}/${task.task_id}`}
            >
              <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] p-4 transition-all duration-200 hover:border-[#ec8522]/50 hover:shadow-lg hover:shadow-[#ec8522]/5 cursor-pointer">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-[#e2e8f0]">
                    {task.task_id}
                  </span>
                  <StateBadge state={task.state} />
                  <span className="inline-flex items-center rounded-full border border-[#1f2937] bg-[#0f172a] px-2 py-0.5 text-xs font-medium text-[#94a3b8]">
                    {task.worker_type}
                  </span>
                </div>
                <p className="text-sm text-[#94a3b8] line-clamp-2 mt-2">
                  {task.objective.split("\n")[0]}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
