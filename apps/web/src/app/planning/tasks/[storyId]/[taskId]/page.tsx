import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiUrl } from "@/lib/api-client";
import { TaskDetail } from "@/components/task-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ storyId: string; taskId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { taskId } = await params;
  return { title: taskId };
}

export default async function TaskPage({ params }: PageProps) {
  const { storyId, taskId } = await params;

  const res = await fetch(
    apiUrl(`/v1/observability/workflow/tasks/${storyId}/${taskId}`),
    { cache: "no-store" },
  );
  if (!res.ok) notFound();

  const data = await res.json();

  return (
    <TaskDetail
      storyId={storyId}
      taskId={taskId}
      initialData={data}
    />
  );
}
