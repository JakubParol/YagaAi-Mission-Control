import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = {
  title: "List",
};

export default function PlanningListPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-1">List</h1>
        <p className="text-muted-foreground">
          Unified planning list view for stories and standalone tasks.
        </p>
      </div>

      <EmptyState
        icon="default"
        title="Loading list view"
        description="The Planning List tab scaffold is ready. Work items will appear here next."
      />
    </>
  );
}
