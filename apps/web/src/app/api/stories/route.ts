import { NextResponse } from "next/server";
import { listStories } from "@/lib/adapters";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stories = await listStories();
    return NextResponse.json(stories);
  } catch (err) {
    console.error("GET /api/stories failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
