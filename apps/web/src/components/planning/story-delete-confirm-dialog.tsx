"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  reduceDeleteConfirmPhase,
  type DeleteConfirmPhase,
} from "./story-actions-menu-types";

export interface StoryDeleteConfirmDialogProps {
  storyLabel: string;
  confirmPhase: DeleteConfirmPhase;
  onPhaseChange: (next: DeleteConfirmPhase) => void;
  onConfirmDelete: () => void;
}

export function StoryDeleteConfirmDialog({
  storyLabel,
  confirmPhase,
  onPhaseChange,
  onConfirmDelete,
}: StoryDeleteConfirmDialogProps) {
  const isConfirmOpen = confirmPhase !== "closed";
  const isConfirming = confirmPhase === "submitting";

  return (
    <Dialog
      open={isConfirmOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onPhaseChange(reduceDeleteConfirmPhase(confirmPhase, "OPEN"));
          return;
        }
        onPhaseChange(reduceDeleteConfirmPhase(confirmPhase, "CANCEL"));
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!isConfirming}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Delete story?</DialogTitle>
          <DialogDescription>
            You are about to delete <span className="font-medium text-foreground">{storyLabel}</span>.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onPhaseChange(reduceDeleteConfirmPhase(confirmPhase, "CANCEL"))}
            disabled={isConfirming}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirmDelete}
            disabled={isConfirming}
          >
            {isConfirming && <Loader2 className="size-3.5 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
