"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StoryActionsMenuProps {
  storyId: string;
  storyKey: string | null;
  storyTitle: string;
  onDelete: (storyId: string) => void | Promise<void>;
  disabled?: boolean;
  isDeleting?: boolean;
  defaultOpen?: boolean;
}

export function StoryActionsMenu({
  storyId,
  storyKey,
  storyTitle,
  onDelete,
  disabled = false,
  isDeleting = false,
  defaultOpen = false,
}: StoryActionsMenuProps) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDisabled = disabled || isDeleting;
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

  const handleDelete = () => {
    if (isDisabled) return;
    const confirmed = window.confirm(
      `Delete story "${storyLabel}"? This action cannot be undone.`,
    );
    if (!confirmed) return;
    setOpen(false);
    void onDelete(storyId);
  };

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
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
