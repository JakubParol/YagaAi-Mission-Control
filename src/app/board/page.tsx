import { listStories, listTasksForStory } from "@/lib/adapters";
import { KanbanBoard } from "@/components/kanban-board";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const stories = await listStories();
  const allTasks: Task[] = [];

  for (const story of stories) {
    const tasks = await listTasksForStory(story.id);
    allTasks.push(...tasks);
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Board</h1>
        <p className="text-muted-foreground">
          {allTasks.length} {allTasks.length === 1 ? "task" : "tasks"} across{" "}
          {stories.length} {stories.length === 1 ? "story" : "stories"}
        </p>
      </div>
      <KanbanBoard initialData={{ stories, tasks: allTasks }} />
    </>
  );
}
