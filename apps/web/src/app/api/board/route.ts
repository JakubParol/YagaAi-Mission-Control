import { NextResponse } from "next/server";
import { listStories, listTasksForStory } from "@/lib/adapters";
import { withErrorHandler } from "@/lib/errors";
import type { SupervisorTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const stories = await listStories();
  const allTasks: SupervisorTask[] = [];

  for (const story of stories) {
    const tasks = await listTasksForStory(story.id);
    allTasks.push(...tasks);
  }

  return NextResponse.json({ stories, tasks: allTasks });
});
