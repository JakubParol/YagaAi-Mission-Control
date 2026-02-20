import { NextResponse } from "next/server";
import { listStories, listTasksForStory } from "@/lib/adapters";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const stories = await listStories();
  const allTasks: Task[] = [];

  for (const story of stories) {
    const tasks = await listTasksForStory(story.id);
    allTasks.push(...tasks);
  }

  return NextResponse.json({ stories, tasks: allTasks });
}
