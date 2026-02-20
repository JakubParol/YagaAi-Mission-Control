import { BookOpen, ListTodo, CheckCircle, AlertTriangle } from "lucide-react";
import { listStories } from "@/lib/adapters";
import { StoryList } from "@/components/story-list";
import { StatCard, StatCardsRow } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stories = await listStories();

  // Aggregate task counts across all stories
  let totalTasks = 0;
  let tasksDone = 0;
  let tasksBlocked = 0;

  for (const story of stories) {
    const c = story.task_counts;
    totalTasks += c.BACKLOG + c.PLANNED + c.ASSIGNED + c.DONE + c.BLOCKED;
    tasksDone += c.DONE;
    tasksBlocked += c.BLOCKED;
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#e2e8f0] mb-1">Stories</h1>
        <p className="text-[#94a3b8]">
          {stories.length} {stories.length === 1 ? "story" : "stories"} in the
          Supervisor System
        </p>
      </div>

      <StatCardsRow>
        <StatCard label="Total Stories" value={stories.length} icon={BookOpen} iconColor="text-[#ec8522]" iconBg="bg-[#ec8522]/10" />
        <StatCard label="Total Tasks" value={totalTasks} icon={ListTodo} iconColor="text-[#e2e8f0]" iconBg="bg-[#e2e8f0]/10" />
        <StatCard label="Tasks Done" value={tasksDone} icon={CheckCircle} iconColor="text-green-400" iconBg="bg-green-500/10" />
        <StatCard label="Tasks Blocked" value={tasksBlocked} icon={AlertTriangle} iconColor="text-red-400" iconBg="bg-red-500/10" />
      </StatCardsRow>

      <StoryList initialData={stories} />
    </>
  );
}
