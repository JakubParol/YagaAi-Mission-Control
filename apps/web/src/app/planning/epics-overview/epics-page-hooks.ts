/**
 * Extracted epic CRUD callbacks for the epics overview page.
 * Keeps the page component under the 300-line limit.
 */

import { useCallback } from "react";

import type { EpicFormValues } from "@/components/planning/epic-form-dialog";
import type { DeleteConfirmPhase } from "@/components/planning/story-actions-menu-types";
import { moveWorkItemToEpic } from "../story-actions";
import { deleteEpic, fetchEpicDetail } from "./epics-page-actions";
import type { EpicOverviewItem } from "./overview-types";

interface DeleteDialogState {
  epicId: string;
  epicTitle: string;
  phase: DeleteConfirmPhase;
}

interface EditDialogState {
  open: boolean;
  epicId: string;
  initialValues?: Partial<EpicFormValues>;
}

interface MoveToEpicState {
  storyId: string;
  storyKey: string | null;
  storyTitle: string;
  currentEpicId: string;
}

export type { DeleteDialogState, EditDialogState, MoveToEpicState };

interface EpicPageDeps {
  state: { kind: string; rows?: EpicOverviewItem[] };
  moveToEpicState: MoveToEpicState | null;
  deleteDialogState: DeleteDialogState | null;
  refreshCurrentView: () => Promise<void>;
  setEpicActionError: (msg: string | null) => void;
  setEditDialogState: (s: EditDialogState | null) => void;
  setDeleteDialogState: React.Dispatch<React.SetStateAction<DeleteDialogState | null>>;
}

export function useEpicPageCallbacks(deps: EpicPageDeps) {
  const {
    state, moveToEpicState, deleteDialogState, refreshCurrentView,
    setEpicActionError, setEditDialogState, setDeleteDialogState,
  } = deps;

  const handleEditEpic = useCallback(async (epicId: string) => {
    setEpicActionError(null);
    try {
      const detail = await fetchEpicDetail(epicId);
      setEditDialogState({
        open: true,
        epicId,
        initialValues: {
          title: detail.title, status: detail.status,
          description: detail.description ?? "",
          priority: detail.priority !== null ? String(detail.priority) : "",
        },
      });
    } catch (err) {
      setEpicActionError(err instanceof Error ? err.message : "Failed to load epic details for editing.");
    }
  }, [setEditDialogState, setEpicActionError]);

  const handleDeleteEpic = useCallback((epicId: string) => {
    if (state.kind !== "ok" || !state.rows) return;
    const item = state.rows.find((r) => r.work_item_id === epicId);
    if (!item) return;
    if (item.children_total > 0) {
      setEpicActionError(
        `Cannot delete "${item.title}" — it still has ${item.children_total} child ${item.children_total === 1 ? "story" : "stories"}. Move or delete them first.`,
      );
      return;
    }
    setDeleteDialogState({ epicId, epicTitle: item.title, phase: "open" });
  }, [setDeleteDialogState, setEpicActionError, state]);

  const handleCreateSaved = useCallback(async () => {
    setEpicActionError(null);
    try { await refreshCurrentView(); } catch (err) {
      setEpicActionError(err instanceof Error ? err.message : "Failed to refresh after creating epic.");
    }
  }, [refreshCurrentView, setEpicActionError]);

  const handleEditSaved = useCallback(async () => {
    setEpicActionError(null);
    try { await refreshCurrentView(); } catch (err) {
      setEpicActionError(err instanceof Error ? err.message : "Failed to refresh after updating epic.");
    }
  }, [refreshCurrentView, setEpicActionError]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteDialogState) return;
    const { epicId } = deleteDialogState;
    setDeleteDialogState((s) => s ? { ...s, phase: "submitting" } : null);
    setEpicActionError(null);
    try {
      await deleteEpic(epicId);
      setDeleteDialogState(null);
      await refreshCurrentView();
    } catch (err) {
      setDeleteDialogState((s) => s ? { ...s, phase: "open" } : null);
      setEpicActionError(err instanceof Error ? err.message : "Failed to delete epic.");
    }
  }, [deleteDialogState, refreshCurrentView, setDeleteDialogState, setEpicActionError]);

  const handleMoveToEpicConfirm = useCallback(async (targetEpicId: string) => {
    if (!moveToEpicState) return;
    await moveWorkItemToEpic(moveToEpicState.storyId, targetEpicId);
    await refreshCurrentView();
  }, [moveToEpicState, refreshCurrentView]);

  return {
    handleEditEpic,
    handleDeleteEpic,
    handleCreateSaved,
    handleEditSaved,
    handleConfirmDelete,
    handleMoveToEpicConfirm,
  };
}
