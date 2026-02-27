import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = {
  title: "Stories",
};

export default function StoriesPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-1">Stories</h1>
        <p className="text-muted-foreground">
          Planning stories managed through the planning module.
        </p>
      </div>

      <EmptyState
        icon="stories"
        title="Coming soon"
        description="Stories will be available once the planning module API is connected."
      />
    </>
  );
}
