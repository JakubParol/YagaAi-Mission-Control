"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StoryLabel } from "@/lib/planning/types";
import {
  STORY_DETAIL_HEADER_LAYOUT,
  shouldShowStoryDetailActions,
  StoryDetailHeader,
} from "./story-detail-header";
import { StoryDetailFields } from "./story-detail-fields";
import { ConfirmDiscardDialog } from "./story-detail-confirm-dialog";
import { useStoryDetailState } from "./story-detail-state";

export { STORY_DETAIL_HEADER_LAYOUT, shouldShowStoryDetailActions };

// ── StoryDetailDialog ───────────────────────────────────────────────────────

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
  initialLabels?: StoryLabel[];
  onStoryUpdated?: () => void;
}) {
  const isActive = embedded ? storyId !== null : open;

  const s = useStoryDetailState({
    storyId,
    isActive,
    embedded,
    initialLabels,
    onOpenChange,
    onStoryUpdated,
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  const dialogBody = (
    <>
      {s.viewState.kind === "loading" && (
        <>
          {embedded ? (
            <h1 className="sr-only">Loading story&#8230;</h1>
          ) : (
            <DialogHeader>
              <DialogTitle className="sr-only">Loading story&#8230;</DialogTitle>
            </DialogHeader>
          )}
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </>
      )}

      {s.viewState.kind === "error" && (
        <>
          {embedded ? (
            <h1 className="sr-only">Error</h1>
          ) : (
            <DialogHeader>
              <DialogTitle className="sr-only">Error</DialogTitle>
            </DialogHeader>
          )}
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-3 size-6 text-destructive" />
            <p className="text-sm text-muted-foreground">{s.viewState.message}</p>
          </div>
        </>
      )}

      {s.viewState.kind === "ok" && s.storyDraft && (
        <div className="flex flex-col gap-5">
          <StoryDetailHeader
            story={s.viewState.story}
            storyDraft={s.storyDraft}
            embedded={embedded}
            isSaving={s.isSavingStory}
            isDeleting={s.isDeletingStory}
            onStatusChange={s.handleStoryStatusChange}
            onDelete={s.handleStoryDelete}
            onTitleChange={(value) => s.updateStoryDraft("title", value)}
          />
          <StoryDetailFields
            story={s.viewState.story}
            storyDraft={s.storyDraft}
            storyError={s.storyError}
            epics={s.epics}
            isLoadingEpics={s.isLoadingEpics}
            isSaving={s.isSavingStory}
            hasUnsavedChanges={s.hasUnsavedStoryChanges}
            onDraftChange={s.updateStoryDraft}
            onSave={s.saveStory}
            onCancel={s.handleCancelChanges}
            taskManagerProps={{
              tasks: s.viewState.tasks,
              isCreating: s.isCreatingTask,
              pendingTaskIds: s.pendingSet,
              error: s.taskError,
              onCreate: s.createTask,
              onPatch: s.patchTask,
              onMarkDone: s.markTaskDone,
              onDelete: s.deleteTaskHandler,
            }}
            labelManagerProps={{
              labels: s.storyLabels,
              availableLabels: s.availableLabels,
              selectedLabelId: s.selectedLabelId,
              isLoading: s.isLoadingLabels,
              pendingLabelIds: s.pendingLabelSet,
              error: s.labelError,
              onSelectLabel: s.setSelectedLabelId,
              onAttachLabel: s.attachLabel,
              onDetachLabel: s.detachLabel,
            }}
          />
        </div>
      )}

      {s.viewState.kind === "ok" && !s.storyDraft && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );

  const discardConfirm = (
    <ConfirmDiscardDialog
      open={s.showDiscardConfirm}
      onKeepEditing={() => s.setShowDiscardConfirm(false)}
      onDiscard={() => {
        s.setShowDiscardConfirm(false);
        s.executeDialogClose();
      }}
    />
  );

  if (embedded) {
    return (
      <div className="w-full">
        {dialogBody}
        {discardConfirm}
      </div>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={s.handleDialogOpenChange}>
        <DialogContent
          className="sm:max-w-6xl max-h-[90vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          {dialogBody}
        </DialogContent>
      </Dialog>
      {discardConfirm}
    </>
  );
}
