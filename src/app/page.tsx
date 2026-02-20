import { listStories } from "@/lib/adapters";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stories = await listStories();

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-2">Mission Control</h1>
      <p className="text-muted-foreground mb-8">
        Supervisor System — {stories.length} {stories.length === 1 ? "story" : "stories"}
      </p>
      {stories.length === 0 ? (
        <p className="text-muted-foreground">
          No stories found. Check that SUPERVISOR_SYSTEM_PATH is configured correctly.
        </p>
      ) : (
        <ul className="space-y-2">
          {stories.map((story) => (
            <li key={story.id} className="border rounded-lg p-4">
              <span className="font-mono font-medium">{story.id}</span>
              <span className="ml-4 text-sm text-muted-foreground">
                P:{story.task_counts.PLANNED} A:{story.task_counts.ASSIGNED} D:{story.task_counts.DONE} B:{story.task_counts.BLOCKED}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
