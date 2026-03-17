"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BacklogKind } from "@/lib/planning/types";
import { BOARD_KIND_OPTIONS } from "./backlog-types";
import { createBoard } from "./board-actions";

export interface CreateBoardDialogProps {
  open: boolean;
  projectId: string | null;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateBoardDialog({
  open,
  projectId,
  onOpenChange,
  onCreated,
}: CreateBoardDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BacklogKind>("SPRINT");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setKind("SPRINT");
    setGoal("");
    setStartDate("");
    setEndDate("");
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) resetForm();
    },
    [onOpenChange, resetForm],
  );

  const handleKindChange = useCallback((nextKind: BacklogKind) => {
    setKind(nextKind);
    setError(null);
    if (nextKind !== "SPRINT") {
      setGoal("");
      setStartDate("");
      setEndDate("");
    }
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectId || isCreating) return;

      const trimmedName = name.trim();
      if (trimmedName.length === 0) {
        setError("Board name is required.");
        return;
      }

      if (kind === "SPRINT" && startDate && endDate && startDate > endDate) {
        setError("Sprint end date must be on or after start date.");
        return;
      }

      setIsCreating(true);
      setError(null);

      try {
        await createBoard({
          projectId,
          name: trimmedName,
          kind,
          goal:
            kind === "SPRINT" && goal.trim().length > 0
              ? goal.trim()
              : null,
          startDate:
            kind === "SPRINT" && startDate ? startDate : null,
          endDate:
            kind === "SPRINT" && endDate ? endDate : null,
        });
        onOpenChange(false);
        resetForm();
        onCreated();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create board.",
        );
      } finally {
        setIsCreating(false);
      }
    },
    [endDate, goal, isCreating, kind, name, onCreated, onOpenChange, projectId, resetForm, startDate],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Create board</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="board-name" className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <input
              id="board-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Sprint 14"
              autoComplete="off"
              className={cn(
                "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
              disabled={isCreating}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="board-kind" className="text-xs font-medium text-muted-foreground">
              Kind
            </label>
            <select
              id="board-kind"
              value={kind}
              onChange={(event) =>
                handleKindChange(event.target.value as BacklogKind)
              }
              className={cn(
                "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
              disabled={isCreating}
            >
              {BOARD_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {kind === "SPRINT" && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="board-goal" className="text-xs font-medium text-muted-foreground">
                  Goal (optional)
                </label>
                <input
                  id="board-goal"
                  type="text"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder="Sprint goal"
                  autoComplete="off"
                  className={cn(
                    "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                    "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  )}
                  disabled={isCreating}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="board-start-date" className="text-xs font-medium text-muted-foreground">
                    Start date (optional)
                  </label>
                  <input
                    id="board-start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className={cn(
                      "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    )}
                    disabled={isCreating}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="board-end-date" className="text-xs font-medium text-muted-foreground">
                    End date (optional)
                  </label>
                  <input
                    id="board-end-date"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className={cn(
                      "h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    )}
                    disabled={isCreating}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create board"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
