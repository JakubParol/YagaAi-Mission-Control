import { Archive, Clock, UserCheck, CheckCircle, AlertTriangle } from "lucide-react";
import { listStories, listTasksForStory } from "@/lib/adapters";
import { KanbanBoard } from "@/components/kanban-board";
import { StatCard, StatCardsRow } from "@/components/stat-card";
import type { Task, TaskState } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const stories = await listStories();
  const allTasks: Task[] = [];

  for (const story of stories) {
    const tasks = await listTasksForStory(story.id);
    allTasks.push(...tasks);
  }

  // Compute counts per state
  const counts: Record<TaskState, number> = {
    BACKLOG: 0, PLANNED: 0, ASSIGNED: 0, DONE: 0, BLOCKED: 0,
  };
  for (const t of allTasks) {
    counts[t.state]++;
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#e2e8f0] mb-1">Board</h1>
        <p className="text-[#94a3b8]">
          {allTasks.length} {allTasks.length === 1 ? "task" : "tasks"} across{" "}
          {stories.length} {stories.length === 1 ? "story" : "stories"}
        </p>
      </div>

      <StatCardsRow>
        <StatCard label="Backlog" value={counts.BACKLOG} icon={Archive} iconColor="text-slate-400" iconBg="bg-slate-500/10" />
        <StatCard label="Planned" value={counts.PLANNED} icon={Clock} iconColor="text-gray-400" iconBg="bg-gray-500/10" />
        <StatCard label="Assigned" value={counts.ASSIGNED} icon={UserCheck} iconColor="text-amber-400" iconBg="bg-amber-500/10" />
        <StatCard label="Done" value={counts.DONE} icon={CheckCircle} iconColor="text-green-400" iconBg="bg-green-500/10" />
        <StatCard label="Blocked" value={counts.BLOCKED} icon={AlertTriangle} iconColor="text-red-400" iconBg="bg-red-500/10" />
      </StatCardsRow>

      <KanbanBoard initialData={{ stories, tasks: allTasks }} />
    </>
  );
}
