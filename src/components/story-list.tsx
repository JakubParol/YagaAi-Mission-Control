"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { TaskCountBadges } from "@/components/task-count-badges";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { EmptyState } from "./empty-state";
import { ErrorCard } from "./error-card";
import type { Story } from "@/lib/types";

/** Extract the first meaningful line from markdown as a summary. */
function extractSummary(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("id:") || trimmed.startsWith("owner:") || trimmed.startsWith("created_at:") || trimmed.startsWith("updated_at:")) continue;
    if (trimmed.startsWith("---")) continue;
    // Return first real content line, truncated
    return trimmed.length > 200 ? trimmed.slice(0, 200) + "…" : trimmed;
  }
  return "No description";
}

export function StoryList({ initialData }: { initialData: Story[] }) {
  const { data: stories, error } = useAutoRefresh<Story[]>({
    url: "/api/stories",
    initialData,
  });

  if (error) return <ErrorCard title='Connection Error' message={error} suggestion='Verify that SUPERVISOR_SYSTEM_PATH is set correctly and the path is accessible.' />;

  if (stories.length === 0) {
    return (
      <EmptyState icon='📋' title='No stories yet' description='Stories will appear here once they are created in the Supervisor System. Check that SUPERVISOR_SYSTEM_PATH is configured correctly.' />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((story) => (
        <Link key={story.id} href={`/stories/${story.id}`}>
          <Card className="h-full transition-colors hover:border-primary/50 cursor-pointer">
            <CardHeader>
              <CardTitle className="font-mono text-base">{story.id}</CardTitle>
              <CardDescription className="line-clamp-3">
                {extractSummary(story.content)}
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <TaskCountBadges counts={story.task_counts} />
            </CardFooter>
          </Card>
        </Link>
      ))}
    </div>
  );
}
