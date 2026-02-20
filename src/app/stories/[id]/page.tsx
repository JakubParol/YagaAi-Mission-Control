import { notFound } from "next/navigation";
import { getStory, listTasksForStory } from "@/lib/adapters";
import { StoryDetail } from "@/components/story-detail";

export const dynamic = "force-dynamic";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) notFound();

  const tasks = await listTasksForStory(id);

  return <StoryDetail storyId={id} initialData={{ story, tasks }} />;
}
