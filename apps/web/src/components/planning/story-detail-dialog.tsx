"use client";

import { Maximize2, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkItemLabel } from "@/lib/planning/types";
import { ConfirmDiscardDialog } from "./story-detail-confirm-dialog";
import {
  getStoryDetailShellState,
} from "./story-detail-shell";
import {
  WorkItemWorkspaceContent,
  useWorkItemWorkspaceState,
} from "./work-item-workspace";

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
  const shell = getStoryDetailShellState({ embedded, open, storyId });

  const ws = useWorkItemWorkspaceState({
    workItemId: storyId,
    isActive: shell.isActive,
    initialLabels,
    onWorkItemUpdated: onStoryUpdated,
    onRequestClose: () => onOpenChange?.(false),
    onWorkItemDeleted: embedded
      ? () => { window.location.assign(shell.deleteRedirectHref); }
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
        <DialogHeader className="flex flex-row items-center justify-end gap-1">
          <DialogTitle className="sr-only">{srTitle}</DialogTitle>
          {shell.fullPageHref && (
            <a
              href={shell.fullPageHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Open in full page"
            >
              <Maximize2 className="size-3.5" />
              <span className="hidden sm:inline">Full page</span>
            </a>
          )}
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </Button>
          </DialogClose>
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
          showCloseButton={false}
        >
          {content}
        </DialogContent>
      </Dialog>
      {discardConfirm}
    </>
  );
}
