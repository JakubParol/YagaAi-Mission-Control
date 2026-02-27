import { NextResponse } from "next/server";
import { getTask, getTaskResults } from "@/lib/adapters";
import { withErrorHandler, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (_request, context) => {
  const { storyId, taskId } = await context!.params;
  const task = await getTask(storyId, taskId);
  if (!task) {
    throw new NotFoundError("Task not found");
  }
  const results = await getTaskResults(storyId, taskId);
  return NextResponse.json({ task, results });
});
