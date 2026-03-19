"use client";

import { useParams } from "next/navigation";

import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";

export default function WorkItemPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="mx-auto max-w-6xl py-6">
      <StoryDetailDialog
        storyId={id}
        embedded
        onStoryUpdated={() => undefined}
      />
    </div>
  );
}
