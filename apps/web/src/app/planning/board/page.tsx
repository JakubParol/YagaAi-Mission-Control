"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EmptyState } from "@/components/empty-state";
import { SprintBoard, type ActiveSprintData } from "@/components/planning/sprint-board";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";

type BoardState =
  | { kind: "no-project" }
  | { kind: "loading" }
  | { kind: "no-sprint" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: ActiveSprintData };

export default function BoardPage() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const [state, setState] = useState<BoardState>({ kind: "no-project" });
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  const handleStoryClick = useCallback((storyId: string) => {
    setSelectedStoryId(storyId);
  }, []);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) setSelectedStoryId(null);
  }, []);

  const singleProjectId =
    !allSelected && selectedProjectIds.length === 1
      ? selectedProjectIds[0]
      : null;

  useEffect(() => {
    if (!singleProjectId) {
      setState({ kind: "no-project" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });

    fetch(apiUrl(`/v1/planning/backlogs/active-sprint?project_id=${singleProjectId}`))
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setState({ kind: "no-sprint" });
          return null;
        }
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled || !json) return;
        setState({ kind: "ok", data: json.data });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ kind: "error", message: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [singleProjectId]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-1">Board</h1>
        <p className="text-muted-foreground text-sm">
          Active sprint board for the selected project.
        </p>
      </div>

      {state.kind === "no-project" && (
        <EmptyState
          icon="board"
          title="Select a project"
          description="Choose a single project from the selector above to view its active sprint board."
        />
      )}

      {state.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {state.kind === "no-sprint" && (
        <EmptyState
          icon="board"
          title="No active sprint"
          description="This project has no active sprint. Create a sprint and set it to ACTIVE to see stories on the board."
        />
      )}

      {state.kind === "error" && (
        <EmptyState
          icon="default"
          title="Failed to load sprint"
          description={state.message}
        />
      )}

      {state.kind === "ok" && (
        <SprintBoard data={state.data} onStoryClick={handleStoryClick} />
      )}

      <StoryDetailDialog
        storyId={selectedStoryId}
        open={selectedStoryId !== null}
        onOpenChange={handleDialogClose}
      />
    </>
  );
}
