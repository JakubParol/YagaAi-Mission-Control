import { NextResponse } from "next/server";
import { getTask, getTaskResults } from "@/lib/adapters";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storyId: string; taskId: string }> }
) {
  const { storyId, taskId } = await params;
  const task = await getTask(storyId, taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const results = await getTaskResults(storyId, taskId);
  return NextResponse.json({ task, results });
}
