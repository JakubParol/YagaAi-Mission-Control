"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { ItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EmptyState } from "@/components/empty-state";
import { SprintBoard, type ActiveSprintData } from "@/components/planning/sprint-board";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { applyOptimisticStoryStatus, rollbackStoryStatus } from "./status-updates";

type BoardState =
  | { kind: "no-project" }
  | { kind: "loading"; projectId: string }
  | { kind: "no-sprint"; projectId: string }
  | { kind: "error"; projectId: string; message: string }
  | { kind: "ok"; projectId: string; data: ActiveSprintData };

export default function BoardPage() {
  const { selectedProjectIds, allSelected } = usePlanningFilter();
  const [state, setState] = useState<BoardState>({ kind: "no-project" });
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [pendingStoryIds, setPendingStoryIds] = useState<Record<string, true>>({});
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const handleStoryClick = useCallback((storyId: string) => {
    setSelectedStoryId(storyId);
  }, []);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) setSelectedStoryId(null);
  }, []);

  const showErrorToast = useCallback((message: string) => {
    setErrorToast(message);
  }, []);

  useEffect(() => {
    if (!errorToast) return;
    const timeoutId = window.setTimeout(() => {
      setErrorToast(null);
    }, 3500);
    return () => window.clearTimeout(timeoutId);
  }, [errorToast]);

  const singleProjectId =
    !allSelected && selectedProjectIds.length === 1
      ? selectedProjectIds[0]
      : null;

  const viewState: BoardState = !singleProjectId
    ? { kind: "no-project" }
    : state.kind !== "no-project" && state.projectId === singleProjectId
      ? state
      : { kind: "loading", projectId: singleProjectId };

  useEffect(() => {
    if (!singleProjectId) return;

    let cancelled = false;
    setPendingStoryIds({});

    fetch(apiUrl(`/v1/planning/backlogs/active-sprint?project_id=${singleProjectId}`))
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled)
            setState({ kind: "no-sprint", projectId: singleProjectId });
          return null;
        }
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled || !json) return;
        setState({ kind: "ok", projectId: singleProjectId, data: json.data });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            kind: "error",
            projectId: singleProjectId,
            message: String(err),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [singleProjectId]);

  const handleStoryStatusChange = useCallback(
    async (storyId: string, nextStatus: ItemStatus) => {
      let previousStatus: ItemStatus | null = null;

      setState((prevState) => {
        if (prevState.kind !== "ok") return prevState;
        const result = applyOptimisticStoryStatus(prevState.data, storyId, nextStatus);
        previousStatus = result.previousStatus;
        if (!result.previousStatus) return prevState;
        return {
          ...prevState,
          data: result.data,
        };
      });

      if (!previousStatus) return;

      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch {
        const fallbackStatus = previousStatus;
        setState((prevState) => {
          if (prevState.kind !== "ok") return prevState;
          return {
            ...prevState,
            data: rollbackStoryStatus(prevState.data, storyId, fallbackStatus),
          };
        });
        showErrorToast("Failed to update story status. Changes were rolled back.");
      } finally {
        setPendingStoryIds((prev) => {
          const next = { ...prev };
          delete next[storyId];
          return next;
        });
      }
    },
    [showErrorToast],
  );

  return (
    <>
      {errorToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200 shadow-lg"
        >
          {errorToast}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-1">Board</h1>
        <p className="text-muted-foreground text-sm">
          Active sprint board for the selected project.
        </p>
      </div>

      {viewState.kind === "no-project" && (
        <EmptyState
          icon="board"
          title="Select a project"
          description="Choose a single project from the selector above to view its active sprint board."
        />
      )}

      {viewState.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {viewState.kind === "no-sprint" && (
        <EmptyState
          icon="board"
          title="No active sprint"
          description="This project has no active sprint. Create a sprint and set it to ACTIVE to see stories on the board."
        />
      )}

      {viewState.kind === "error" && (
        <EmptyState
          icon="default"
          title="Failed to load sprint"
          description={viewState.message}
        />
      )}

      {viewState.kind === "ok" && (
        <SprintBoard
          data={viewState.data}
          onStoryClick={handleStoryClick}
          onStoryStatusChange={handleStoryStatusChange}
          pendingStoryIds={new Set(Object.keys(pendingStoryIds))}
        />
      )}

      <StoryDetailDialog
        storyId={selectedStoryId}
        open={selectedStoryId !== null}
        onOpenChange={handleDialogClose}
      />
    </>
  );
}
