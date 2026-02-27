import { NextResponse } from "next/server";
import { listStories } from "@/lib/adapters";
import { withErrorHandler } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const stories = await listStories();
  return NextResponse.json(stories);
});
