"use client";

import {
  BacklogEditDialog,
  type BacklogEditItem,
} from "@/components/planning/backlog-edit-dialog";
import { StoryForm } from "@/components/planning/story-form";
import { StoryDetailDialog } from "@/components/planning/story-detail-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type {
  BacklogItem,
  DeleteBoardDialogState,
  SprintCompleteConfirmDialogState,
  SprintCompleteDialogState,
  SprintStartDialogState,
} from "./backlog-types";
import {
  SprintStartDialog,
  SprintCompleteConfirmDialog,
  SprintCompleteWithTargetDialog,
  DeleteBoardDialog,
} from "./backlog-dialogs";
import { CreateBoardDialog } from "./backlog-create-board-dialog";

export interface BacklogPageDialogsProps {
  singleProjectId: string | null;
  pendingSprintIds: Record<string, true>;
  pendingBoardIds: Record<string, true>;
  startDialog: SprintStartDialogState | null;
  completeConfirmDialog: SprintCompleteConfirmDialogState | null;
  completeDialog: SprintCompleteDialogState | null;
  completeTargetBacklogId: string;
  completeDialogTargetOptions: BacklogItem[];
  completeDialogError: string | null;
  deleteBoardDialog: DeleteBoardDialogState | null;
  createBoardOpen: boolean;
  activeSelectedStoryId: string | null;
  selectedStoryLabels?: Array<{ id: string; name: string; color: string | null }>;
  editBoardBacklog: BacklogEditItem | null;
  createBacklogId: string | null;
  onStartDialogChange: (open: boolean) => void;
  onStartDialogConfirm: () => void;
  onCompleteConfirmDialogChange: (open: boolean) => void;
  onCompleteConfirmDialogConfirm: () => void;
  onCompleteDialogChange: (open: boolean) => void;
  onCompleteDialogConfirm: () => void;
  onCompleteTargetChange: (targetId: string) => void;
  onClearCompleteError: () => void;
  onDeleteBoardDialogChange: (open: boolean) => void;
  onDeleteBoardConfirm: () => void;
  onCreateBoardOpenChange: (open: boolean) => void;
  onBoardCreated: () => void;
  onSelectedStoryChange: (open: boolean) => void;
  onStoryUpdated: () => void;
  onEditBoardChange: (open: boolean) => void;
  onEditBoardSaved: () => void;
  onCreateBacklogChange: (open: boolean) => void;
  onCreateStorySaved: () => void;
  onCreateStoryCancel: () => void;
}

export function BacklogPageDialogs({
  singleProjectId,
  pendingSprintIds,
  pendingBoardIds,
  startDialog,
  completeConfirmDialog,
  completeDialog,
  completeTargetBacklogId,
  completeDialogTargetOptions,
  completeDialogError,
  deleteBoardDialog,
  createBoardOpen,
  activeSelectedStoryId,
  selectedStoryLabels,
  editBoardBacklog,
  createBacklogId,
  onStartDialogChange,
  onStartDialogConfirm,
  onCompleteConfirmDialogChange,
  onCompleteConfirmDialogConfirm,
  onCompleteDialogChange,
  onCompleteDialogConfirm,
  onCompleteTargetChange,
  onClearCompleteError,
  onDeleteBoardDialogChange,
  onDeleteBoardConfirm,
  onCreateBoardOpenChange,
  onBoardCreated,
  onSelectedStoryChange,
  onStoryUpdated,
  onEditBoardChange,
  onEditBoardSaved,
  onCreateBacklogChange,
  onCreateStorySaved,
  onCreateStoryCancel,
}: BacklogPageDialogsProps) {
  return (
    <>
      <SprintStartDialog
        backlogName={startDialog?.backlogName ?? ""}
        open={startDialog !== null}
        submitting={startDialog !== null && Boolean(pendingSprintIds[startDialog.backlogId])}
        onOpenChange={onStartDialogChange}
        onConfirm={onStartDialogConfirm}
      />
      <SprintCompleteConfirmDialog
        backlogName={completeConfirmDialog?.backlogName ?? ""}
        open={completeConfirmDialog !== null}
        submitting={completeConfirmDialog !== null && Boolean(pendingSprintIds[completeConfirmDialog.backlogId])}
        onOpenChange={onCompleteConfirmDialogChange}
        onConfirm={onCompleteConfirmDialogConfirm}
      />
      {completeDialog && (
        <SprintCompleteWithTargetDialog
          dialog={completeDialog}
          open
          submitting={Boolean(pendingSprintIds[completeDialog.backlogId])}
          targetBacklogId={completeTargetBacklogId}
          targetOptions={completeDialogTargetOptions}
          error={completeDialogError}
          onTargetChange={onCompleteTargetChange}
          onOpenChange={onCompleteDialogChange}
          onConfirm={onCompleteDialogConfirm}
          onClearError={onClearCompleteError}
        />
      )}
      <DeleteBoardDialog
        backlogName={deleteBoardDialog?.backlogName ?? ""}
        open={deleteBoardDialog !== null}
        submitting={deleteBoardDialog !== null && Boolean(pendingBoardIds[deleteBoardDialog.backlogId])}
        onOpenChange={onDeleteBoardDialogChange}
        onConfirm={onDeleteBoardConfirm}
      />
      <CreateBoardDialog
        open={createBoardOpen}
        projectId={singleProjectId}
        onOpenChange={onCreateBoardOpenChange}
        onCreated={onBoardCreated}
      />
      <StoryDetailDialog
        storyId={activeSelectedStoryId}
        open={activeSelectedStoryId !== null}
        onOpenChange={onSelectedStoryChange}
        initialLabels={selectedStoryLabels}
        onStoryUpdated={onStoryUpdated}
      />
      <BacklogEditDialog
        backlog={editBoardBacklog}
        open={editBoardBacklog !== null}
        onOpenChange={onEditBoardChange}
        onSaved={onEditBoardSaved}
      />
      <Dialog open={createBacklogId !== null} onOpenChange={onCreateBacklogChange}>
        <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Create story</DialogTitle></DialogHeader>
          {singleProjectId && createBacklogId && (
            <StoryForm
              mode="create"
              projectId={singleProjectId}
              backlogId={createBacklogId}
              onSaved={onCreateStorySaved}
              onCancel={onCreateStoryCancel}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
