"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { ItemStatus } from "@/lib/planning/types";
import { usePlanningFilter } from "@/components/planning/planning-filter-context";
import { EmptyState } from "@/components/empty-state";
import { filterStoriesBySelectedLabels } from "@/components/planning/story-label-filter";
import { SprintBoard, type ActiveSprintData } from "@/components/planning/sprint-board";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import { applyOptimisticStoryStatus, rollbackStoryStatus } from "./status-updates";
import { subscribeToSprintLifecycleChanged } from "../sprint-lifecycle-events";

type BoardState =
  | { kind: "no-project" }
  | { kind: "loading"; projectId: string }
  | { kind: "no-sprint"; projectId: string }
  | { kind: "error"; projectId: string; message: string }
  | { kind: "ok"; projectId: string; data: ActiveSprintData };

export default function BoardPage() {
  const { selectedProjectIds, allSelected, selectedLabelIds } = usePlanningFilter();
  const [state, setState] = useState<BoardState>({ kind: "no-project" });
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [pendingStoryIds, setPendingStoryIds] = useState<Record<string, true>>({});
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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

  const visibleState: BoardState =
    viewState.kind === "ok"
      ? {
          ...viewState,
          data: {
            ...viewState.data,
            stories: filterStoriesBySelectedLabels(viewState.data.stories, selectedLabelIds),
          },
        }
      : viewState;
  const selectedStoryLabels =
    state.kind === "ok" && selectedStoryId
      ? state.data.stories.find((story) => story.id === selectedStoryId)?.labels
      : undefined;

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
  }, [reloadToken, singleProjectId]);

  useEffect(() => {
    if (!singleProjectId) return;
    return subscribeToSprintLifecycleChanged((payload) => {
      if (payload.projectId !== singleProjectId) return;
      setReloadToken((prev) => prev + 1);
    });
  }, [singleProjectId]);

  const handleStoryStatusChange = useCallback(
    async (storyId: string, nextStatus: ItemStatus) => {
      if (state.kind !== "ok") return;
      const existingStory = state.data.stories.find((item) => item.id === storyId);
      if (!existingStory || existingStory.status === nextStatus) return;
      const previousStatus: ItemStatus = existingStory.status;

      setState((prevState) => {
        if (prevState.kind !== "ok") return prevState;
        const result = applyOptimisticStoryStatus(prevState.data, storyId, nextStatus);
        if (!result.previousStatus) return prevState;
        return {
          ...prevState,
          data: result.data,
        };
      });

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
    [showErrorToast, state],
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
        {selectedLabelIds.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Filtered by {selectedLabelIds.length} label
            {selectedLabelIds.length === 1 ? "" : "s"}.
          </p>
        )}
      </div>

      {visibleState.kind === "no-project" && (
        <EmptyState
          icon="board"
          title="Select a project"
          description="Choose a single project from the selector above to view its active sprint board."
        />
      )}

      {visibleState.kind === "loading" && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {visibleState.kind === "no-sprint" && (
        <EmptyState
          icon="board"
          title="No active sprint"
          description="This project has no active sprint. Create a sprint and set it to ACTIVE to see stories on the board."
        />
      )}

      {visibleState.kind === "error" && (
        <EmptyState
          icon="default"
          title="Failed to load sprint"
          description={visibleState.message}
        />
      )}

      {visibleState.kind === "ok" && (
        <SprintBoard
          data={visibleState.data}
          onStoryClick={handleStoryClick}
          onStoryStatusChange={handleStoryStatusChange}
          pendingStoryIds={new Set(Object.keys(pendingStoryIds))}
        />
      )}

      <StoryDetailDialog
        storyId={selectedStoryId}
        open={selectedStoryId !== null}
        onOpenChange={handleDialogClose}
        initialLabels={selectedStoryLabels}
        onStoryUpdated={() => setReloadToken((prev) => prev + 1)}
      />
    </>
  );
}
