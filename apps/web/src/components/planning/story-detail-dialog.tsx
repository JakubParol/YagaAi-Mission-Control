"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkItemLabel } from "@/lib/planning/types";
import {
  STORY_DETAIL_HEADER_LAYOUT,
  shouldShowStoryDetailActions,
} from "./story-detail-header";
import { ConfirmDiscardDialog } from "./story-detail-confirm-dialog";
import {
  WorkItemWorkspaceContent,
  useWorkItemWorkspaceState,
} from "./work-item-workspace";

export { STORY_DETAIL_HEADER_LAYOUT, shouldShowStoryDetailActions };

// ── StoryDetailDialog ───────────────────────────────────────────────────────

/**
 * Modal/embedded shell that wraps the canonical WorkItemWorkspace.
 *
 * This is a thin shell — all content, state, and data fetching are delegated
 * to WorkItemWorkspace. The shell only adds Dialog chrome and close/discard logic.
 */
export function StoryDetailDialog({
  storyId,
  open = false,
  onOpenChange,
  embedded = false,
  initialLabels,
  onStoryUpdated,
}: {
  storyId: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  embedded?: boolean;
  initialLabels?: WorkItemLabel[];
  onStoryUpdated?: () => void;
}) {
  const isActive = embedded ? storyId !== null : open;

  const ws = useWorkItemWorkspaceState({
    workItemId: storyId,
    isActive,
    initialLabels,
    onWorkItemUpdated: onStoryUpdated,
    onRequestClose: () => onOpenChange?.(false),
    onWorkItemDeleted: embedded
      ? () => { window.location.assign("/planning/list"); }
      : () => onOpenChange?.(false),
  });

  // ── Shell-level close handling ─────────────────────────────────────────

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (ws.hasUnsavedChanges) { ws.setShowDiscardConfirm(true); return; }
      ws.discardAndClose();
    } else {
      onOpenChange?.(true);
    }
  };

  // ── Accessibility title for Dialog ─────────────────────────────────────

  const srTitle = ws.viewState.kind === "ok"
    ? ws.viewState.workItem.title
    : ws.viewState.kind === "error" ? "Error" : "Loading\u2026";

  // ── Render ─────────────────────────────────────────────────────────────

  const content = (
    <>
      {!embedded && (
        <DialogHeader>
          <DialogTitle className="sr-only">{srTitle}</DialogTitle>
        </DialogHeader>
      )}
      {embedded && <h1 className="sr-only">{srTitle}</h1>}
      <WorkItemWorkspaceContent workspace={ws} />
    </>
  );

  const discardConfirm = (
    <ConfirmDiscardDialog
      open={ws.showDiscardConfirm}
      onKeepEditing={() => ws.setShowDiscardConfirm(false)}
      onDiscard={() => { ws.setShowDiscardConfirm(false); ws.discardAndClose(); }}
    />
  );

  if (embedded) {
    return (
      <div className="w-full">
        {content}
        {discardConfirm}
      </div>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="sm:max-w-6xl max-h-[90vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          {content}
        </DialogContent>
      </Dialog>
      {discardConfirm}
    </>
  );
}
