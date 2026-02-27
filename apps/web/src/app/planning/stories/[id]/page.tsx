import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = {
  title: "Story Detail",
};

export default function StoryPage() {
  return (
    <EmptyState
      icon="stories"
      title="Coming soon"
      description="Story details will be available once the planning module API is connected."
    />
  );
}
