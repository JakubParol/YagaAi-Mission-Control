"use client";

import { useParams } from "next/navigation";

import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";

export default function StoryPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <StoryDetailDialog storyId={id ?? null} embedded />
    </div>
  );
}
