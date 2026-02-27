"use client";

import { useMemo } from "react";
import Link from "next/link";
import { TaskCountBadges } from "@/components/task-count-badges";
import { apiUrl } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { EmptyState } from "./empty-state";
import { ErrorCard } from "./error-card";
import type { SupervisorStory } from "@/lib/types";

/** Extract the first meaningful line from markdown as a summary. */
function extractSummary(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (
      trimmed.startsWith("id:") ||
      trimmed.startsWith("owner:") ||
      trimmed.startsWith("created_at:") ||
      trimmed.startsWith("updated_at:")
    )
      continue;
    if (trimmed.startsWith("---")) continue;
    return trimmed.length > 200 ? trimmed.slice(0, 200) + "\u2026" : trimmed;
  }
  return "No description";
}

export function StoryList({ initialData }: { initialData: SupervisorStory[] }) {
  const { data: stories, error } = useAutoRefresh<SupervisorStory[]>({
    url: apiUrl("/v1/observability/supervisor/stories"),
    initialData,
  });

  // Memoize summaries so extractSummary doesn't re-run on every render
  const summaries = useMemo(() => {
    const map = new Map<string, string>();
    for (const story of stories) {
      map.set(story.id, extractSummary(story.content));
    }
    return map;
  }, [stories]);

  if (error) {
    return (
      <ErrorCard
        title="Connection Error"
        message={error}
        suggestion="Verify that SUPERVISOR_SYSTEM_PATH is set correctly and the path is accessible."
      />
    );
  }

  if (stories.length === 0) {
    return (
      <EmptyState
        icon="stories"
        title="No stories yet"
        description="Stories will appear here once they are created in the Supervisor System. Check that SUPERVISOR_SYSTEM_PATH is configured correctly."
      />
    );
  }

  return (
    <div
      role="list"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {stories.map((story) => (
        <Link
          key={story.id}
          href={`/planning/stories/${story.id}`}
          role="listitem"
          aria-label={`Story ${story.id}`}
          className="focus-ring group flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors duration-150 hover:border-primary/40 hover:bg-white/[0.02]"
        >
          <div className="min-w-0">
            <h3 className="truncate font-mono text-sm font-semibold text-foreground transition-colors duration-150 group-hover:text-primary">
              {story.id}
            </h3>
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {summaries.get(story.id)}
            </p>
          </div>
          <div className="mt-auto pt-2">
            <TaskCountBadges counts={story.task_counts} />
          </div>
        </Link>
      ))}
    </div>
  );
}
