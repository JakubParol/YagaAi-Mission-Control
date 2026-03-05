"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const STORY_ACTIONS_SUPPORTED_TYPES = ["USER_STORY", "TASK", "BUG"] as const;

export function isStoryActionsSupportedType(storyType: string | null | undefined): boolean {
  if (!storyType) return false;
  const normalized = storyType.trim().toUpperCase();
  return STORY_ACTIONS_SUPPORTED_TYPES.includes(
    normalized as (typeof STORY_ACTIONS_SUPPORTED_TYPES)[number],
  );
}

export type DeleteConfirmPhase = "closed" | "open" | "submitting";
export type DeleteConfirmEvent = "OPEN" | "CANCEL" | "CONFIRM" | "FINISH";

export function reduceDeleteConfirmPhase(
  phase: DeleteConfirmPhase,
  event: DeleteConfirmEvent,
): DeleteConfirmPhase {
  if (event === "OPEN") return phase === "closed" ? "open" : phase;
  if (event === "CANCEL") return phase === "submitting" ? phase : "closed";
  if (event === "CONFIRM") return phase === "open" ? "submitting" : phase;
  if (event === "FINISH") return "closed";
  return phase;
}

interface StoryActionsMenuProps {
  storyId: string;
  storyType: string | null | undefined;
  storyKey: string | null;
  storyTitle: string;
  onDelete: (storyId: string) => void | Promise<void>;
  disabled?: boolean;
  isDeleting?: boolean;
  defaultOpen?: boolean;
  defaultConfirmOpen?: boolean;
}

export function StoryActionsMenu({
  storyId,
  storyType,
  storyKey,
  storyTitle,
  onDelete,
  disabled = false,
  isDeleting = false,
  defaultOpen = false,
  defaultConfirmOpen = false,
}: StoryActionsMenuProps) {
  const isSupportedType = isStoryActionsSupportedType(storyType);
  const [open, setOpen] = useState(defaultOpen);
  const [confirmPhase, setConfirmPhase] = useState<DeleteConfirmPhase>(
    defaultConfirmOpen ? "open" : "closed",
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const isDisabled = disabled || isDeleting;
  const isConfirmOpen = confirmPhase !== "closed";
  const isConfirming = confirmPhase === "submitting";
  const storyLabel = storyKey ? `${storyKey} ${storyTitle}` : storyTitle;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleDeleteMenuItem = () => {
    if (isDisabled) return;
    setOpen(false);
    setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "OPEN"));
  };

  const handleConfirmDelete = async () => {
    if (isDisabled || isConfirming) return;
    setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "CONFIRM"));
    try {
      await onDelete(storyId);
    } finally {
      setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "FINISH"));
    }
  };

  if (!isSupportedType) return null;

  return (
    <div
      ref={rootRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={isDisabled}
        aria-label={`Open story actions for ${storyLabel}`}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((prev) => !prev)}
      >
        {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={`Story actions for ${storyLabel}`}
          className={cn(
            "absolute right-0 top-full z-30 mt-1 min-w-36 rounded-md border border-border/70 bg-card p-1 shadow-xl",
            "animate-in fade-in-0 zoom-in-95 duration-100",
          )}
        >
          <button
            type="button"
            role="menuitem"
            disabled={isDisabled}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
              "text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50",
            )}
            onClick={handleDeleteMenuItem}
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      )}

      <Dialog
        open={isConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "OPEN"));
            return;
          }
          setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "CANCEL"));
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
              onClick={() => setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "CANCEL"))}
              disabled={isConfirming}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleConfirmDelete();
              }}
              disabled={isConfirming}
            >
              {isConfirming && <Loader2 className="size-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
