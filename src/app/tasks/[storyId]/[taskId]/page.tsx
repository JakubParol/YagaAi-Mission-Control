import { notFound } from "next/navigation";
import { getTask, getTaskResults } from "@/lib/adapters";
import { TaskDetail } from "@/components/task-detail";

export const dynamic = "force-dynamic";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ storyId: string; taskId: string }>;
}) {
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
