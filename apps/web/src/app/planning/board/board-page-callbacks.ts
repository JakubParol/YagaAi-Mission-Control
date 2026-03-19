import { useCallback } from "react";

import type { WorkItemStatus } from "@/lib/planning/types";
import { deleteStory } from "../story-actions";
import { applyOptimisticStoryStatus, rollbackStoryStatus } from "./status-updates";
import {
  fetchBoardState,
  patchStoryStatus,
  patchStoryAssignee,
  patchStoryRank,
  type BoardState,
} from "./board-page-actions";
import {
  applyOptimisticStoryRank,
  computeReorderRank,
  removePendingId,
} from "./board-page-derived";
import type { DropPlacement } from "@/components/planning/sprint-board";

interface BoardCallbackDeps {
  state: BoardState;
  setState: React.Dispatch<React.SetStateAction<BoardState>>;
  setPendingStoryIds: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  pendingStoryIds: Record<string, true>;
  setErrorToast: (msg: string) => void;
  selectedStoryId: string | null;
  setSelectedStoryId: (id: string | null) => void;
  refreshCurrentView: () => Promise<void>;
}

export function useBoardCallbacks({
  state,
  setState,
  setPendingStoryIds,
  pendingStoryIds,
  setErrorToast,
  selectedStoryId,
  setSelectedStoryId,
  refreshCurrentView,
}: BoardCallbackDeps) {
  const handleStoryStatusChange = useCallback(
    async (storyId: string, nextStatus: WorkItemStatus, placement?: DropPlacement | null) => {
      if (state.kind !== "ok") return;
      const existingStory = state.data.items.find((item) => item.id === storyId);
      if (!existingStory || existingStory.status === nextStatus) return;
      const previousStatus: WorkItemStatus = existingStory.status;
      const previousRank = existingStory.rank;
      const backlogId = state.data.backlog.id;

      const newRank = placement
        ? computeReorderRank(state.data.items, storyId, placement.beforeId, placement.afterId)
        : null;

      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        const statusResult = applyOptimisticStoryStatus(prev.data, storyId, nextStatus);
        if (!statusResult.previousStatus) return prev;
        const afterStatus: BoardState = { ...prev, data: statusResult.data };
        return newRank ? applyOptimisticStoryRank(afterStatus, storyId, newRank) : afterStatus;
      });
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        await patchStoryStatus(storyId, nextStatus);
        if (newRank) {
          try {
            await patchStoryRank(backlogId, storyId, newRank);
          } catch {
            try { await refreshCurrentView(); } catch { /* leave optimistic state */ }
            setErrorToast("Story moved but position could not be saved. Board refreshed.");
          }
        }
      } catch {
        setState((prev) => {
          if (prev.kind !== "ok") return prev;
          const withRestoredRank = newRank ? applyOptimisticStoryRank(prev, storyId, previousRank) : prev;
          if (withRestoredRank.kind !== "ok") return withRestoredRank;
          return { ...withRestoredRank, data: rollbackStoryStatus(withRestoredRank.data, storyId, previousStatus) };
        });
        setErrorToast("Failed to update story status. Changes were rolled back.");
      } finally {
        setPendingStoryIds((prev) => removePendingId(prev, storyId));
      }
    },
    [refreshCurrentView, setErrorToast, setPendingStoryIds, setState, state],
  );

  const handleStoryReorder = useCallback(
    async (storyId: string, beforeId: string | null, afterId: string | null) => {
      if (state.kind !== "ok") return;
      const existingStory = state.data.items.find((item) => item.id === storyId);
      if (!existingStory) return;

      const newRank = computeReorderRank(state.data.items, storyId, beforeId, afterId);
      if (newRank === null) return;

      const previousRank = existingStory.rank;
      const backlogId = state.data.backlog.id;

      setState((prev) => applyOptimisticStoryRank(prev, storyId, newRank));
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));

      try {
        await patchStoryRank(backlogId, storyId, newRank);
      } catch {
        setState((prev) => applyOptimisticStoryRank(prev, storyId, previousRank));
        setErrorToast("Failed to reorder story. Changes were rolled back.");
      } finally {
        setPendingStoryIds((prev) => removePendingId(prev, storyId));
      }
    },
    [setErrorToast, setPendingStoryIds, setState, state],
  );

  const handleStoryDelete = useCallback(
    async (storyId: string) => {
      if (state.kind !== "ok") return;
      if (pendingStoryIds[storyId]) return;
      const projectId = state.projectId;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        await deleteStory(storyId);
        if (selectedStoryId === storyId) setSelectedStoryId(null);
        const nextState = await fetchBoardState(projectId);
        setPendingStoryIds({});
        setState(nextState);
      } catch (error) {
        setErrorToast(error instanceof Error ? error.message : "Failed to delete story.");
      } finally {
        setPendingStoryIds((prev) => removePendingId(prev, storyId));
      }
    },
    [pendingStoryIds, selectedStoryId, setErrorToast, setPendingStoryIds, setSelectedStoryId, setState, state],
  );

  const handleStoryAssigneeChange = useCallback(
    async (storyId: string, assigneeAgentId: string | null) => {
      if (state.kind !== "ok") return;
      if (pendingStoryIds[storyId]) return;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        await patchStoryAssignee(storyId, assigneeAgentId);
      } finally {
        setPendingStoryIds((prev) => removePendingId(prev, storyId));
      }
    },
    [pendingStoryIds, setPendingStoryIds, state.kind],
  );

  return {
    handleStoryStatusChange,
    handleStoryReorder,
    handleStoryDelete,
    handleStoryAssigneeChange,
  };
}
