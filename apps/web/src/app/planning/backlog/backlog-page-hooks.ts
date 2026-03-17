/**
 * Extracted callback hooks for the backlog page.
 *
 * Groups sprint-lifecycle, sprint-membership, and board-management
 * callbacks to keep the page component under the 300-line limit.
 */

import { useCallback } from "react";

import { completeSprint, startSprint, type SprintLifecycleOperation } from "../sprint-lifecycle-actions";
import { emitSprintLifecycleChanged } from "../sprint-lifecycle-events";
import { addStoryToActiveSprint, removeStoryFromActiveSprint } from "../sprint-membership-actions";
import { deleteBoard } from "./board-actions";
import { moveOpenStoriesToTarget, swapBoardOrder } from "./backlog-page-actions";
import { computeBoardSwapTarget, prepareSprintCompletion, removePendingId } from "./backlog-page-derived";
import type { PageState, SprintCompleteDialogState } from "./backlog-types";

type PendingDispatch = React.Dispatch<React.SetStateAction<Record<string, true>>>;

interface BacklogPageDeps {
  singleProjectId: string | null;
  state: PageState;
  defaultBacklogId: string | null;
  showErrorToast: (msg: string) => void;
  refreshCurrentView: () => Promise<void>;
  setPendingStoryIds: PendingDispatch;
  setPendingSprintIds: PendingDispatch;
  setPendingBoardIds: PendingDispatch;
}

export function useBacklogPageCallbacks(deps: BacklogPageDeps) {
  const {
    singleProjectId, state, defaultBacklogId,
    showErrorToast, refreshCurrentView,
    setPendingStoryIds, setPendingSprintIds, setPendingBoardIds,
  } = deps;

  const updateSprintMembership = useCallback(
    async (storyId: string, op: "add" | "remove") => {
      if (!singleProjectId) return;
      setPendingStoryIds((prev) => ({ ...prev, [storyId]: true }));
      try {
        if (op === "add") await addStoryToActiveSprint(singleProjectId, storyId);
        else await removeStoryFromActiveSprint(singleProjectId, storyId);
        await refreshCurrentView();
      } catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to update sprint membership."); }
      finally { setPendingStoryIds((prev) => removePendingId(prev, storyId)); }
    },
    [refreshCurrentView, showErrorToast, singleProjectId, setPendingStoryIds],
  );

  const updateSprintLifecycle = useCallback(
    async (backlogId: string, op: SprintLifecycleOperation) => {
      if (!singleProjectId) return;
      setPendingSprintIds((prev) => ({ ...prev, [backlogId]: true }));
      try {
        if (op === "start") await startSprint(singleProjectId, backlogId);
        else await completeSprint(singleProjectId, backlogId);
        emitSprintLifecycleChanged({ projectId: singleProjectId, backlogId, operation: op });
        await refreshCurrentView();
      } catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to update sprint status."); }
      finally { setPendingSprintIds((prev) => removePendingId(prev, backlogId)); }
    },
    [refreshCurrentView, showErrorToast, singleProjectId, setPendingSprintIds],
  );

  const handleCompleteSprint = useCallback(
    (backlogId: string, backlogName: string) => prepareSprintCompletion(state, backlogId, backlogName),
    [state],
  );

  const handleCompleteDialogConfirm = useCallback(
    async (
      completeDialog: SprintCompleteDialogState,
      completeTargetBacklogId: string,
      completeDialogTargetOptions: ReadonlyArray<{ id: string }>,
      setError: (msg: string | null) => void,
    ) => {
      if (!singleProjectId || !defaultBacklogId) return;
      if (!completeTargetBacklogId) { setError("Select where open work items should be moved."); return; }
      if (!completeDialogTargetOptions.some((b) => b.id === completeTargetBacklogId)) { setError("Selected target board is no longer available. Refresh and try again."); return; }
      setError(null);
      setPendingSprintIds((prev) => ({ ...prev, [completeDialog.backlogId]: true }));
      try {
        await moveOpenStoriesToTarget(singleProjectId, completeDialog.backlogId, completeTargetBacklogId, defaultBacklogId, completeDialog.openStories);
        await completeSprint(singleProjectId, completeDialog.backlogId);
        emitSprintLifecycleChanged({ projectId: singleProjectId, backlogId: completeDialog.backlogId, operation: "complete" });
        await refreshCurrentView();
      } catch (error) { setError(error instanceof Error ? error.message : "Failed to complete sprint."); }
      finally { setPendingSprintIds((prev) => removePendingId(prev, completeDialog.backlogId)); }
    },
    [defaultBacklogId, refreshCurrentView, singleProjectId, setPendingSprintIds],
  );

  const handleMoveBoard = useCallback(
    async (backlogId: string, direction: "top" | "up" | "down" | "bottom") => {
      const swap = computeBoardSwapTarget(state, backlogId, direction);
      if (!swap) return;
      setPendingBoardIds((prev) => ({ ...prev, [backlogId]: true }));
      try { await swapBoardOrder(swap.currentId, swap.swapWithId, swap.currentOrder, swap.swapWithOrder); await refreshCurrentView(); }
      catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to reorder board."); }
      finally { setPendingBoardIds((prev) => removePendingId(prev, backlogId)); }
    },
    [refreshCurrentView, showErrorToast, state, setPendingBoardIds],
  );

  const handleDeleteBoardConfirm = useCallback(
    async (backlogId: string, onClose: () => void) => {
      setPendingBoardIds((prev) => ({ ...prev, [backlogId]: true }));
      try { await deleteBoard(backlogId); onClose(); await refreshCurrentView(); }
      catch (error) { showErrorToast(error instanceof Error ? error.message : "Failed to delete board."); }
      finally { setPendingBoardIds((prev) => removePendingId(prev, backlogId)); }
    },
    [refreshCurrentView, showErrorToast, setPendingBoardIds],
  );

  return {
    updateSprintMembership,
    updateSprintLifecycle,
    handleCompleteSprint,
    handleCompleteDialogConfirm,
    handleMoveBoard,
    handleDeleteBoardConfirm,
  };
}
