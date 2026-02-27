import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = {
  title: "Board",
};

export default function BoardPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-1">Board</h1>
        <p className="text-muted-foreground">
          Kanban board for planning tasks.
        </p>
      </div>

      <EmptyState
        icon="board"
        title="Coming soon"
        description="The board will be available once the planning module API is connected."
      />
    </>
  );
}
