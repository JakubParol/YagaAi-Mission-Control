"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchEpics, type FetchEpicsResult } from "./story-detail-actions";
import {
  createStory,
  initialFormValues,
  STORY_TYPE_OPTIONS,
  updateStory,
  type StoryFormFieldErrors,
  type StoryFormProps,
  type StoryFormValues,
} from "./story-form-actions";

export type { StoryFormProps } from "./story-form-actions";

export function StoryForm({
  mode,
  projectId,
  backlogId,
  storyId,
  initialValues,
  submitLabel,
  onSaved,
  onCancel,
}: StoryFormProps) {
  const [values, setValues] = useState<StoryFormValues>(() =>
    initialFormValues(initialValues),
  );
  const [epics, setEpics] = useState<FetchEpicsResult[]>([]);
  const [isLoadingEpics, setIsLoadingEpics] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<StoryFormFieldErrors>({});

  useEffect(() => {
    setValues(initialFormValues(initialValues));
    setFieldErrors({});
    setFormError(null);
  }, [initialValues]);

  useEffect(() => {
    if (!projectId) {
      setEpics([]);
      setIsLoadingEpics(false);
      return;
    }

    let cancelled = false;
    setIsLoadingEpics(true);

    fetchEpics(projectId)
      .then((items) => {
        if (!cancelled) setEpics(items);
      })
      .catch(() => {
        if (!cancelled) setEpics([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEpics(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const buttonLabel = useMemo(() => {
    if (submitLabel) return submitLabel;
    return mode === "create" ? "Create story" : "Save changes";
  }, [mode, submitLabel]);

  const updateValue = (key: keyof StoryFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (mode === "create" && !backlogId) {
      setFormError("Backlog context is required to create a story.");
      return;
    }
    if (mode === "create" && !projectId) {
      setFormError("Project context is required to create a story.");
      return;
    }
    if (mode === "edit" && !storyId) {
      setFormError("Story id is required for edit mode.");
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const result =
        mode === "create"
          ? await createStory(values, projectId!, backlogId!)
          : await updateStory(values, storyId!);

      if (!result.ok) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        setFormError(result.formError ?? null);
        return;
      }

      onSaved(result.storyId!);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {formError && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {formError}
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="story-title" className="text-xs text-muted-foreground">
          Title
        </label>
        <input
          id="story-title"
          value={values.title}
          disabled={isSubmitting}
          onChange={(event) => updateValue("title", event.target.value)}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-ring"
        />
        {fieldErrors.title && (
          <p className="text-xs text-red-300">{fieldErrors.title}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label
            htmlFor="story-type"
            className="text-xs text-muted-foreground"
          >
            Type
          </label>
          <select
            id="story-type"
            value={values.story_type}
            disabled={isSubmitting}
            onChange={(event) => updateValue("story_type", event.target.value)}
            className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-ring"
          >
            {STORY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.story_type && (
            <p className="text-xs text-red-300">{fieldErrors.story_type}</p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="story-priority"
            className="text-xs text-muted-foreground"
          >
            Priority
          </label>
          <input
            id="story-priority"
            type="number"
            min={0}
            value={values.priority}
            disabled={isSubmitting}
            onChange={(event) => updateValue("priority", event.target.value)}
            className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-ring"
          />
          {fieldErrors.priority && (
            <p className="text-xs text-red-300">{fieldErrors.priority}</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="story-epic" className="text-xs text-muted-foreground">
          Epic
        </label>
        <select
          id="story-epic"
          value={values.epic_id}
          disabled={isSubmitting || isLoadingEpics}
          onChange={(event) => updateValue("epic_id", event.target.value)}
          className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-ring"
        >
          <option value="">No epic</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.key ? `${epic.key} ${epic.title}` : epic.title}
            </option>
          ))}
        </select>
        {fieldErrors.epic_id && (
          <p className="text-xs text-red-300">{fieldErrors.epic_id}</p>
        )}
      </div>

      <div className="space-y-1">
        <label
          htmlFor="story-description"
          className="text-xs text-muted-foreground"
        >
          Description
        </label>
        <textarea
          id="story-description"
          value={values.description}
          disabled={isSubmitting}
          onChange={(event) => updateValue("description", event.target.value)}
          rows={4}
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus-ring"
        />
        {fieldErrors.description && (
          <p className="text-xs text-red-300">{fieldErrors.description}</p>
        )}
      </div>

      {mode === "edit" && (
        <div className="space-y-1">
          <label
            htmlFor="story-blocked-reason"
            className="text-xs text-muted-foreground"
          >
            Blocked reason
          </label>
          <textarea
            id="story-blocked-reason"
            value={values.blocked_reason}
            disabled={isSubmitting}
            onChange={(event) =>
              updateValue("blocked_reason", event.target.value)
            }
            rows={2}
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus-ring"
            placeholder="Leave empty to mark story as not blocked."
          />
          {fieldErrors.blocked_reason && (
            <p className="text-xs text-red-300">
              {fieldErrors.blocked_reason}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-3 animate-spin" />}
          {buttonLabel}
        </Button>
      </div>
    </form>
  );
}
