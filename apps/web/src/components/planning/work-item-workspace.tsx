"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

import type { WorkItemLabel } from "@/lib/planning/types";
import { StoryDetailHeader } from "./story-detail-header";
import { StoryDetailFields } from "./story-detail-fields";
import { ConfirmDiscardDialog } from "./story-detail-confirm-dialog";
import { useWorkItemWorkspaceState } from "./work-item-workspace-state";

// ── Props ──────────────────────────────────────────────────────────────────

export interface WorkItemWorkspaceProps {
  /** UUID of the work item to display/edit. Null means no item selected. */
  workItemId: string | null;
  /** Whether the workspace is currently visible. Controls data fetching. */
  isActive: boolean;
  /** Pre-loaded labels to display before the fetch completes. */
  initialLabels?: WorkItemLabel[];
  /** Called after any mutation so the parent can refresh list data. */
  onWorkItemUpdated?: () => void;
  /** Called when the workspace wants to close (after delete, etc.). */
  onRequestClose?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Canonical work-item workspace core for the Planning detail UX.
 *
 * Renders the full work-item editing experience: header (title, status, actions),
 * body (intent, description, tasks, labels, sidebar fields), and save/cancel controls.
 *
 * Surface-agnostic — no Dialog, no page layout. Mount this inside any shell
 * (modal dialog, full page, embedded panel) and it works identically.
 */
export function WorkItemWorkspace({
  workItemId,
  isActive,
  initialLabels,
  onWorkItemUpdated,
  onRequestClose,
}: WorkItemWorkspaceProps) {
  const ws = useWorkItemWorkspaceState({
    workItemId,
    isActive,
    initialLabels,
    onWorkItemUpdated,
    onRequestClose,
  });

  return (
    <>
      <WorkItemWorkspaceContent workspace={ws} />
      <ConfirmDiscardDialog
        open={ws.showDiscardConfirm}
        onKeepEditing={() => ws.setShowDiscardConfirm(false)}
        onDiscard={() => { ws.setShowDiscardConfirm(false); ws.discardAndClose(); }}
      />
    </>
  );
}

// ── Content renderer ───────────────────────────────────────────────────────

/** Props accepted by the inner content renderer when state is managed externally. */
export interface WorkItemWorkspaceContentProps {
  workspace: ReturnType<typeof useWorkItemWorkspaceState>;
}

/**
 * Stateless content renderer for the workspace. Use this when you need to manage
 * the workspace state externally (e.g. the shell needs access to hasUnsavedChanges).
 */
export function WorkItemWorkspaceContent({ workspace: ws }: WorkItemWorkspaceContentProps) {
  if (ws.viewState.kind === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (ws.viewState.kind === "error") {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="mx-auto mb-3 size-6 text-destructive" />
        <p className="text-sm text-muted-foreground">{ws.viewState.message}</p>
      </div>
    );
  }

  if (!ws.workItemDraft) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <StoryDetailHeader
        story={ws.viewState.workItem}
        storyDraft={ws.workItemDraft}
        embedded={false}
        isSaving={ws.isSaving}
        isDeleting={ws.isDeleting}
        onStatusChange={ws.changeStatus}
        onDelete={ws.deleteWorkItem}
        onTitleChange={(value) => ws.updateDraft("title", value)}
      />
      <StoryDetailFields
        story={ws.viewState.workItem}
        storyDraft={ws.workItemDraft}
        storyError={ws.workItemError}
        epics={ws.epics}
        isLoadingEpics={ws.isLoadingEpics}
        isSaving={ws.isSaving}
        hasUnsavedChanges={ws.hasUnsavedChanges}
        onDraftChange={ws.updateDraft}
        onSave={ws.save}
        onCancel={ws.cancelChanges}
        taskManagerProps={{
          tasks: ws.viewState.tasks,
          isCreating: ws.isCreatingTask,
          pendingTaskIds: ws.pendingTaskIds,
          error: ws.taskError,
          onCreate: ws.createTask,
          onPatch: ws.patchTask,
          onMarkDone: ws.markTaskDone,
          onDelete: ws.deleteTask,
        }}
        labelManagerProps={{
          labels: ws.labels,
          availableLabels: ws.availableLabels,
          selectedLabelId: ws.selectedLabelId,
          isLoading: ws.isLoadingLabels,
          pendingLabelIds: ws.pendingLabelIds,
          error: ws.labelError,
          onSelectLabel: ws.setSelectedLabelId,
          onAttachLabel: ws.attachLabel,
          onDetachLabel: ws.detachLabel,
        }}
      />
    </div>
  );
}

// ── Re-exports for convenience ─────────────────────────────────────────────

export type { UseWorkItemWorkspaceParams, WorkspaceViewState } from "./work-item-workspace-state";
export { useWorkItemWorkspaceState } from "./work-item-workspace-state";
