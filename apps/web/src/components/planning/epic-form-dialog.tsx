"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemedSelect } from "@/components/ui/themed-select";
import type { WorkItemStatus } from "@/lib/planning/types";
import {
  createEpic,
  updateEpic,
  type EpicCreatePayload,
  type EpicUpdatePayload,
} from "@/app/planning/epics-overview/epics-page-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EpicFormMode = "create" | "edit";

/** Raw form values — all strings so inputs stay controlled. */
export interface EpicFormValues {
  title: string;
  /** Only meaningful in edit mode; empty string means "no change". */
  status: WorkItemStatus | "";
  description: string;
  /** Stored as string; parsed to integer (or null) on submit. */
  priority: string;
}

export interface EpicFormDialogCreateProps {
  mode: "create";
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (epicId: string) => void;
}

export interface EpicFormDialogEditProps {
  mode: "edit";
  epicId: string;
  initialValues?: Partial<EpicFormValues>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export type EpicFormDialogProps = EpicFormDialogCreateProps | EpicFormDialogEditProps;

// ─── Constants ────────────────────────────────────────────────────────────────

const EPIC_STATUS_OPTIONS = [
  { value: "TODO", label: "TODO" },
  { value: "IN_PROGRESS", label: "IN PROGRESS" },
  { value: "DONE", label: "DONE" },
] as const satisfies ReadonlyArray<{ value: WorkItemStatus; label: string }>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInitialValues(partial?: Partial<EpicFormValues>): EpicFormValues {
  return {
    title: partial?.title ?? "",
    status: partial?.status ?? "TODO",
    description: partial?.description ?? "",
    priority: partial?.priority ?? "",
  };
}

function validateForm(values: EpicFormValues): string | null {
  if (values.title.trim().length === 0) return "Title is required.";
  if (values.priority.trim().length > 0) {
    const n = Number(values.priority.trim());
    if (!Number.isInteger(n) || n < 0) {
      return "Priority must be a non-negative integer.";
    }
  }
  return null;
}

function parsePriority(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

// ─── FormField helper ─────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function EpicFormDialog(props: EpicFormDialogProps) {
  const { mode, open, onOpenChange } = props;

  const [values, setValues] = useState<EpicFormValues>(() => buildInitialValues());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which dialog instance we've initialised to avoid re-seeding on every render.
  const initializedForOpenRef = useRef(false);

  useEffect(() => {
    if (open && !initializedForOpenRef.current) {
      initializedForOpenRef.current = true;
      const seed = mode === "edit" && "initialValues" in props ? props.initialValues : undefined;
      setValues(buildInitialValues(seed));
      setError(null);
    }
    if (!open) {
      initializedForOpenRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: seed values only on open transition
  }, [open]);

  const updateField = (field: keyof EpicFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const validationError = validateForm(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    const title = values.title.trim();
    const description = values.description.trim() || null;
    const priority = parsePriority(values.priority);

    setIsSaving(true);
    setError(null);

    try {
      if (mode === "create") {
        const payload: EpicCreatePayload = { title, projectId: props.projectId };
        if (description !== null) payload.description = description;
        if (priority !== null) payload.priority = priority;

        const { epicId } = await createEpic(payload);
        onOpenChange(false);
        props.onSaved(epicId);
      } else {
        const patch: EpicUpdatePayload = { title, description, priority };
        if (
          values.status === "TODO"
          || values.status === "IN_PROGRESS"
          || values.status === "DONE"
        ) {
          patch.status = values.status;
        }

        await updateEpic(props.epicId, patch);
        onOpenChange(false);
        props.onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create epic" : "Edit epic"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error banner */}
          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          {/* Title */}
          <FormField label="Title *" htmlFor="epic-form-title">
            <input
              id="epic-form-title"
              value={values.title}
              disabled={isSaving}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Epic title..."
              autoFocus
              className="h-9 w-full rounded-lg border border-border/50 bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus-ring"
            />
          </FormField>

          {/* Status — edit mode only */}
          {mode === "edit" && (
            <FormField label="Status">
              <ThemedSelect
                value={values.status}
                options={EPIC_STATUS_OPTIONS}
                placeholder="Select status"
                disabled={isSaving}
                ariaLabel="Epic status"
                onValueChange={(v) => updateField("status", v)}
              />
            </FormField>
          )}

          {/* Priority */}
          <FormField label="Priority" htmlFor="epic-form-priority">
            <input
              id="epic-form-priority"
              type="number"
              min={0}
              value={values.priority}
              disabled={isSaving}
              onChange={(e) => updateField("priority", e.target.value)}
              placeholder="Leave empty for no priority"
              className="h-9 w-full rounded-lg border border-border/50 bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus-ring"
            />
          </FormField>

          {/* Description */}
          <FormField label="Description" htmlFor="epic-form-description">
            <textarea
              id="epic-form-description"
              value={values.description}
              disabled={isSaving}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
              placeholder="Optional description..."
              className="w-full resize-none rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus-ring"
            />
          </FormField>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-1.5 size-3 animate-spin" />}
              {mode === "create" ? "Create epic" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
