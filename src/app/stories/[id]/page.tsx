import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStory, listTasksForStory } from "@/lib/adapters";
import { StoryDetail } from "@/components/story-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function StoryPage({ params }: PageProps) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) notFound();

  const tasks = await listTasksForStory(id);

  return <StoryDetail storyId={id} initialData={{ story, tasks }} />;
}
