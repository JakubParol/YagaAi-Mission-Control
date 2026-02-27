import { NextResponse } from "next/server";
import { getStory, listTasksForStory } from "@/lib/adapters";
import { withErrorHandler, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (_request, context) => {
  const { id } = await context!.params;
  const story = await getStory(id);
  if (!story) {
    throw new NotFoundError("Story not found");
  }
  const tasks = await listTasksForStory(id);
  return NextResponse.json({ story, tasks });
});
