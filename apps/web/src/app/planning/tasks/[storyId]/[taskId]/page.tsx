import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTask, getTaskResults } from "@/lib/adapters";
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
  const task = await getTask(storyId, taskId);
  if (!task) notFound();

  const results = await getTaskResults(storyId, taskId);

  return (
    <TaskDetail
      storyId={storyId}
      taskId={taskId}
      initialData={{ task, results }}
    />
  );
}
