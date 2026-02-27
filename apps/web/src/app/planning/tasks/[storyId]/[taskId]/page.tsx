import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = {
  title: "Task Detail",
};

export default function TaskPage() {
  return (
    <EmptyState
      icon="tasks"
      title="Coming soon"
      description="Task details will be available once the planning module API is connected."
    />
  );
}
