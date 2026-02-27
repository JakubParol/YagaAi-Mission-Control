import { NextResponse } from "next/server";
import { LangfuseRepository } from "@/lib/langfuse-import";
import { withErrorHandler } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  const repo = new LangfuseRepository();
  const models = repo.getDistinctModels();
  return NextResponse.json({ models });
});
