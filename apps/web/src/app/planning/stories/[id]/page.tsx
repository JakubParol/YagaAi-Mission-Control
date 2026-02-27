import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiUrl } from "@/lib/api-client";
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

  const res = await fetch(apiUrl(`/v1/workflow/stories/${id}`), {
    cache: "no-store",
  });
  if (!res.ok) notFound();

  const data = await res.json();

  return <StoryDetail storyId={id} initialData={data} />;
}
