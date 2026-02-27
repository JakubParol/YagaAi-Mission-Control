import type { Metadata } from "next";
import { BookOpen, ListTodo, CheckCircle, AlertTriangle } from "lucide-react";
import { apiUrl } from "@/lib/api-client";
import { StoryList } from "@/components/story-list";
import { StatCard, StatCardsRow } from "@/components/stat-card";
import type { SupervisorStory } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stories",
};

export default async function StoriesPage() {
  let stories: SupervisorStory[] = [];
  try {
    const res = await fetch(apiUrl("/v1/observability/supervisor/stories"), {
      cache: "no-store",
    });
    if (res.ok) stories = await res.json();
  } catch {
    // API unavailable — render empty
  }

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
        <h1 className="text-3xl font-bold text-foreground mb-1">Stories</h1>
        <p className="text-muted-foreground">
          {stories.length} {stories.length === 1 ? "story" : "stories"} in the
          Supervisor System
        </p>
      </div>

      <StatCardsRow>
        <StatCard label="Total Stories" value={stories.length} icon={BookOpen} iconColor="text-primary" iconBg="bg-primary/10" />
        <StatCard label="Total Tasks" value={totalTasks} icon={ListTodo} iconColor="text-foreground" iconBg="bg-foreground/10" />
        <StatCard label="Tasks Done" value={tasksDone} icon={CheckCircle} iconColor="text-green-400" iconBg="bg-green-500/10" />
        <StatCard label="Tasks Blocked" value={tasksBlocked} icon={AlertTriangle} iconColor="text-red-400" iconBg="bg-red-500/10" />
      </StatCardsRow>

      <StoryList initialData={stories} />
    </>
  );
}
