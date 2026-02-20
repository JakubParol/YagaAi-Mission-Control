"use client";

import Link from "next/link";
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
    return trimmed.length > 200 ? trimmed.slice(0, 200) + "…" : trimmed;
  }
  return "No description";
}

export function StoryList({ initialData }: { initialData: Story[] }) {
  const { data: stories, error } = useAutoRefresh<Story[]>({
    url: "/api/stories",
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

  if (stories.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No stories yet"
        description="Stories will appear here once they are created in the Supervisor System. Check that SUPERVISOR_SYSTEM_PATH is configured correctly."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((story) => (
        <Link key={story.id} href={`/stories/${story.id}`}>
          <div className="group h-full rounded-xl border border-[#1f2937] bg-[#0b1220] p-6 transition-all duration-200 hover:border-[#ec8522]/50 hover:shadow-lg hover:shadow-[#ec8522]/5 cursor-pointer flex flex-col gap-4">
            <div>
              <h3 className="font-mono text-base font-semibold text-[#e2e8f0] group-hover:text-[#ec8522] transition-colors duration-200">
                {story.id}
              </h3>
              <p className="text-sm text-[#94a3b8] line-clamp-3 mt-1.5 leading-relaxed">
                {extractSummary(story.content)}
              </p>
            </div>
            <div className="mt-auto pt-2">
              <TaskCountBadges counts={story.task_counts} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
