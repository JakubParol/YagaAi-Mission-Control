"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ui/themed-select";

// ── Types ────────────────────────────────────────────────────────────

export interface MoveToEpicTarget {
  id: string;
  key: string;
  title: string;
}

export interface MoveToEpicDialogProps {
  open: boolean;
  storyKey: string | null;
  storyTitle: string;
  currentEpicId: string;
  epicTargets: readonly MoveToEpicTarget[];
  onMove: (targetEpicId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

// ── Component ────────────────────────────────────────────────────────

export function MoveToEpicDialog({
  open,
  storyKey,
  storyTitle,
  currentEpicId,
  epicTargets,
  onMove,
  onOpenChange,
}: MoveToEpicDialogProps) {
  const [selectedEpicId, setSelectedEpicId] = useState("");
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: ThemedSelectOption[] = epicTargets
    .filter((e) => e.id !== currentEpicId)
    .map((e) => ({ value: e.id, label: `${e.key} ${e.title}` }));

  const handleConfirm = async () => {
    if (!selectedEpicId || isMoving) return;
    setIsMoving(true);
    setError(null);
    try {
      await onMove(selectedEpicId);
      onOpenChange(false);
      setSelectedEpicId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move work item.");
    } finally {
      setIsMoving(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedEpicId("");
      setError(null);
    }
    onOpenChange(next);
  };

  const storyLabel = storyKey ? `${storyKey} ${storyTitle}` : storyTitle;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Move to epic</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Move <span className="font-medium text-foreground">{storyLabel}</span> to a different epic.
          </p>

          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
              Target epic
            </label>
            <ThemedSelect
              value={selectedEpicId}
              options={options}
              placeholder="Select epic…"
              disabled={isMoving}
              ariaLabel="Target epic"
              onValueChange={setSelectedEpicId}
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isMoving}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!selectedEpicId || isMoving}
              onClick={() => void handleConfirm()}
            >
              {isMoving ? <Loader2 className="size-3 animate-spin" /> : <ArrowRight className="size-3" />}
              Move
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
