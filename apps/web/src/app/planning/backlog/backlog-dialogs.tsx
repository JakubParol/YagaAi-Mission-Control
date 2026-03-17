"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BacklogItem, SprintCompleteDialogState } from "./backlog-types";
import { KIND_CONFIG } from "./backlog-types";
import { getPluralizedWorkItems } from "./backlog-view-model";

// ─── Sprint start ────────────────────────────────────────────────────

export interface SprintStartDialogProps {
  backlogName: string;
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function SprintStartDialog({
  backlogName,
  open,
  submitting,
  onOpenChange,
  onConfirm,
}: SprintStartDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Start sprint</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to start{" "}
            <span className="font-semibold text-foreground">{backlogName}</span>
            ? This sprint will become the active sprint board.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                  Starting sprint...
                </>
              ) : (
                "Start sprint"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sprint complete (no open stories) ──────────────────────────────

export interface SprintCompleteConfirmDialogProps {
  backlogName: string;
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function SprintCompleteConfirmDialog({
  backlogName,
  open,
  submitting,
  onOpenChange,
  onConfirm,
}: SprintCompleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Complete sprint</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to complete{" "}
            <span className="font-semibold text-foreground">{backlogName}</span>
            ? This will close the sprint and remove it from the active board.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                  Completing sprint...
                </>
              ) : (
                "Complete sprint"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sprint complete (with open stories) ────────────────────────────

export interface SprintCompleteWithTargetDialogProps {
  dialog: SprintCompleteDialogState;
  open: boolean;
  submitting: boolean;
  targetBacklogId: string;
  targetOptions: BacklogItem[];
  error: string | null;
  onTargetChange: (targetId: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onClearError: () => void;
}

export function SprintCompleteWithTargetDialog({
  dialog,
  open,
  submitting,
  targetBacklogId,
  targetOptions,
  error,
  onTargetChange,
  onOpenChange,
  onConfirm,
  onClearError,
}: SprintCompleteWithTargetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Complete sprint</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This sprint has{" "}
            <span className="font-semibold text-foreground">
              {dialog.completedCount} completed {getPluralizedWorkItems(dialog.completedCount)}
            </span>{" "}
            and{" "}
            <span className="font-semibold text-foreground">
              {dialog.openStories.length} open {getPluralizedWorkItems(dialog.openStories.length)}
            </span>
            .
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Completed work items include everything in the Done column.</p>
            <p>
              Open work items include everything from any other board column.
              Choose where to move them before completing this sprint.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="complete-sprint-target"
              className="text-xs font-medium text-muted-foreground"
            >
              Move open work items to
            </label>
            <select
              id="complete-sprint-target"
              value={targetBacklogId}
              onChange={(event) => {
                onTargetChange(event.target.value);
                if (error) onClearError();
              }}
              disabled={submitting}
              className={cn(
                "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
            >
              <option value="" disabled>
                Select target board
              </option>
              {targetOptions.map((backlog) => (
                <option key={backlog.id} value={backlog.id}>
                  {backlog.name} ({KIND_CONFIG[backlog.kind]?.label ?? backlog.kind}
                  {backlog.is_default ? ", default" : ""})
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={
                submitting ||
                dialog.openStories.length === 0 ||
                targetBacklogId.length === 0
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                  Completing sprint...
                </>
              ) : (
                "Complete sprint"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete board ───────────────────────────────────────────────────

export interface DeleteBoardDialogProps {
  backlogName: string;
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteBoardDialog({
  backlogName,
  open,
  submitting,
  onOpenChange,
  onConfirm,
}: DeleteBoardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Delete board</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">{backlogName}</span>
            ? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                  Deleting board...
                </>
              ) : (
                "Delete board"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
