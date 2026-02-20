import { NextResponse } from "next/server";
import { getStory, listTasksForStory } from "@/lib/adapters";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }
  const tasks = await listTasksForStory(id);
  return NextResponse.json({ story, tasks });
}
