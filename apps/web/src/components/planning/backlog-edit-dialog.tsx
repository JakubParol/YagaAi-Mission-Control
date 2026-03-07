"use client";

import { useEffect, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import type { BacklogKind, BacklogStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BacklogEditItem {
  id: string;
  name: string;
  kind: BacklogKind;
  status: BacklogStatus;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  is_default: boolean;
}

interface BacklogDraft {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<BacklogKind, string> = {
  SPRINT: "Sprint",
  BACKLOG: "Backlog",
  IDEAS: "Ideas",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-blue-500/10 text-blue-300",
  OPEN: "bg-cyan-500/10 text-cyan-300",
  CLOSED: "bg-muted/40 text-muted-foreground/70",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toBacklogDraft(backlog: BacklogEditItem): BacklogDraft {
  return {
    name: backlog.name,
    goal: backlog.goal ?? "",
    start_date: backlog.start_date ? backlog.start_date.slice(0, 10) : "",
    end_date: backlog.end_date ? backlog.end_date.slice(0, 10) : "",
  };
}

function isDraftDirty(draft: BacklogDraft, backlog: BacklogEditItem): boolean {
  const trimmedName = draft.name.trim();
  const trimmedGoal = draft.goal.trim();
  const originalGoal = backlog.goal?.trim() ?? "";
  const originalStartDate = backlog.start_date ? backlog.start_date.slice(0, 10) : "";
  const originalEndDate = backlog.end_date ? backlog.end_date.slice(0, 10) : "";

  return (
    trimmedName !== backlog.name ||
    trimmedGoal !== originalGoal ||
    draft.start_date !== originalStartDate ||
    draft.end_date !== originalEndDate
  );
}

async function parseApiMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as {
      error?: { message?: string };
    };
    if (json.error?.message) return json.error.message;
  } catch {
    // ignore
  }
  return `Request failed. HTTP ${response.status}.`;
}

// ─── FormField ────────────────────────────────────────────────────────────────

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── BacklogEditDialog ────────────────────────────────────────────────────────

export function BacklogEditDialog({
  backlog,
  open,
  onOpenChange,
  onSaved,
}: {
  backlog: BacklogEditItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<BacklogDraft | null>(null);
  const [draftForId, setDraftForId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Initialise / reset draft when backlog changes
  useEffect(() => {
    if (!backlog || !open) return;
    if (draftForId === backlog.id && draft !== null) return;
    setDraft(toBacklogDraft(backlog));
    setDraftForId(backlog.id);
    setError(null);
  }, [backlog, open, draft, draftForId]);

  const isDirty = backlog !== null && draft !== null && isDraftDirty(draft, backlog);
  const isSprint = backlog?.kind === "SPRINT";

  const update = (field: keyof BacklogDraft, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    setError(null);
  };

  const handleDiscard = () => {
    if (!backlog) return;
    setDraft(toBacklogDraft(backlog));
    setError(null);
  };

  const handleSave = async () => {
    if (!backlog || !draft || isSaving) return;

    const trimmedName = draft.name.trim();
    if (trimmedName === "") {
      setError("Board name is required.");
      return;
    }

    if (isSprint && draft.start_date && draft.end_date && draft.start_date > draft.end_date) {
      setError("End date must be on or after start date.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const body: Record<string, unknown> = { name: trimmedName };

      if (isSprint) {
        const trimmedGoal = draft.goal.trim();
        body.goal = trimmedGoal === "" ? null : trimmedGoal;
        body.start_date = draft.start_date === "" ? null : draft.start_date;
        body.end_date = draft.end_date === "" ? null : draft.end_date;
      }

      const response = await fetch(apiUrl(`/v1/planning/backlogs/${backlog.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await parseApiMessage(response));
      }

      // Reset draft tracking so next open gets fresh data
      setDraftForId(null);
      setDraft(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save board.");
    } finally {
      setIsSaving(false);
    }
  };

  const executeClose = () => {
    setDraftForId(null);
    setDraft(null);
    setError(null);
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (isDirty) {
        setShowDiscardConfirm(true);
        return;
      }
      executeClose();
    } else {
      onOpenChange(true);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        {backlog && draft ? (
          <>
            {/* Header */}
            <DialogHeader className="gap-0 pb-1">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {KIND_LABEL[backlog.kind]}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    STATUS_TONE[String(backlog.status)] ?? "bg-muted/40 text-muted-foreground/70",
                  )}
                >
                  {backlog.status}
                </span>
                {backlog.is_default && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
                    Default
                  </span>
                )}
              </div>
              <DialogTitle className="sr-only">Edit board: {backlog.name}</DialogTitle>
              <input
                id="backlog-edit-name"
                value={draft.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Board name…"
                className="w-full border-0 bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-0"
              />
            </DialogHeader>

            {/* Error banner */}
            {error && (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            {/* Sprint-specific fields */}
            {isSprint && (
              <div className="space-y-4 rounded-xl border border-border/30 bg-card/40 p-4">
                <FormField label="Sprint goal" htmlFor="backlog-edit-goal">
                  <textarea
                    id="backlog-edit-goal"
                    value={draft.goal}
                    onChange={(e) => update("goal", e.target.value)}
                    rows={3}
                    placeholder="What is the goal of this sprint?"
                    className="w-full resize-none rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus-ring"
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Start date" htmlFor="backlog-edit-start">
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                      <input
                        id="backlog-edit-start"
                        type="date"
                        value={draft.start_date}
                        onChange={(e) => update("start_date", e.target.value)}
                        className="h-8 w-full rounded-lg border border-border/50 bg-background/60 pl-8 pr-2.5 text-sm text-foreground focus-ring"
                      />
                    </div>
                  </FormField>

                  <FormField label="End date" htmlFor="backlog-edit-end">
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                      <input
                        id="backlog-edit-end"
                        type="date"
                        value={draft.end_date}
                        onChange={(e) => update("end_date", e.target.value)}
                        className="h-8 w-full rounded-lg border border-border/50 bg-background/60 pl-8 pr-2.5 text-sm text-foreground focus-ring"
                      />
                    </div>
                  </FormField>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!isDirty}
                onClick={handleDiscard}
              >
                Discard changes
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!isDirty || isSaving}
                onClick={handleSave}
              >
                {isSaving && <Loader2 className="size-3 animate-spin" />}
                Save changes
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Edit board</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>

    <Dialog
      open={showDiscardConfirm}
      onOpenChange={(nextOpen) => { if (!nextOpen) setShowDiscardConfirm(false); }}
    >
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Discard changes?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          You have unsaved changes. If you close now, your edits will be lost.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setShowDiscardConfirm(false)}>
            Keep editing
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setShowDiscardConfirm(false);
              executeClose();
            }}
          >
            Discard changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
