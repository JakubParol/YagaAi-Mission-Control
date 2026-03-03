"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type StoryFormMode = "create" | "edit";

interface StoryFormValues {
  title: string;
  story_type: string;
  description: string;
  priority: string;
  epic_id: string;
  blocked_reason: string;
}

interface StoryFormFieldErrors {
  title?: string;
  story_type?: string;
  description?: string;
  priority?: string;
  epic_id?: string;
  blocked_reason?: string;
}

interface EpicOption {
  id: string;
  key: string | null;
  title: string;
}

interface StoryFormProps {
  mode: StoryFormMode;
  projectId: string | null;
  backlogId?: string;
  storyId?: string;
  initialValues?: Partial<StoryFormValues>;
  submitLabel?: string;
  onSaved: (storyId: string) => void;
  onCancel?: () => void;
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
  detail?: Array<{
    loc?: Array<string | number>;
    msg?: string;
  }>;
}

const STORY_TYPE_OPTIONS = [
  { value: "USER_STORY", label: "Story" },
  { value: "BUG", label: "Bug" },
  { value: "SPIKE", label: "Spike" },
  { value: "CHORE", label: "Chore" },
] as const;

function initialFormValues(initialValues?: Partial<StoryFormValues>): StoryFormValues {
  return {
    title: initialValues?.title ?? "",
    story_type: initialValues?.story_type ?? "USER_STORY",
    description: initialValues?.description ?? "",
    priority: initialValues?.priority ?? "",
    epic_id: initialValues?.epic_id ?? "",
    blocked_reason: initialValues?.blocked_reason ?? "",
  };
}

async function parseApiError(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

function toFieldKey(loc: Array<string | number> | undefined): keyof StoryFormFieldErrors | null {
  if (!loc || loc.length < 2) return null;
  const key = String(loc[1]);
  switch (key) {
    case "title":
    case "story_type":
    case "description":
    case "priority":
    case "epic_id":
    case "blocked_reason":
      return key;
    default:
      return null;
  }
}

function mapApiErrors(
  responseStatus: number,
  payload: ApiErrorPayload,
): { formError: string | null; fieldErrors: StoryFormFieldErrors } {
  const fieldErrors: StoryFormFieldErrors = {};

  if (responseStatus === 422 && Array.isArray(payload.detail)) {
    for (const item of payload.detail) {
      const key = toFieldKey(item.loc);
      if (key && item.msg) fieldErrors[key] = item.msg;
    }
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  if (hasFieldErrors) {
    return { formError: null, fieldErrors };
  }

  if (payload.error?.message) {
    return { formError: payload.error.message, fieldErrors };
  }

  return { formError: `Request failed. HTTP ${responseStatus}.`, fieldErrors };
}

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
  const [values, setValues] = useState<StoryFormValues>(() => initialFormValues(initialValues));
  const [epics, setEpics] = useState<EpicOption[]>([]);
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

    fetch(apiUrl(`/v1/planning/epics?project_id=${projectId}&limit=100&sort=priority`))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        const items = (json.data ?? []) as EpicOption[];
        setEpics(items);
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

    const normalizedTitle = values.title.trim();
    const normalizedDescription = values.description.trim();
    const normalizedBlockedReason = values.blocked_reason.trim();
    const parsedPriority = values.priority.trim() === "" ? null : Number(values.priority);

    const payload: Record<string, unknown> = {
      title: normalizedTitle,
      story_type: values.story_type,
      description: normalizedDescription === "" ? null : normalizedDescription,
      priority: Number.isFinite(parsedPriority) ? parsedPriority : null,
      epic_id: values.epic_id === "" ? null : values.epic_id,
    };

    if (mode === "create") {
      payload.project_id = projectId!;
    } else {
      payload.is_blocked = normalizedBlockedReason.length > 0;
      payload.blocked_reason =
        normalizedBlockedReason.length > 0 ? normalizedBlockedReason : null;
    }

    try {
      if (mode === "create") {
        const createResponse = await fetch(apiUrl("/v1/planning/stories"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!createResponse.ok) {
          const apiError = await parseApiError(createResponse);
          const mapped = mapApiErrors(createResponse.status, apiError);
          setFieldErrors(mapped.fieldErrors);
          setFormError(mapped.formError);
          return;
        }

        const createBody = await createResponse.json();
        const createdStoryId: string | undefined = createBody?.data?.id;
        if (!createdStoryId) {
          setFormError("Story creation succeeded but response has no story id.");
          return;
        }

        const attachResponse = await fetch(apiUrl(`/v1/planning/backlogs/${backlogId}/stories`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ story_id: createdStoryId, position: 0 }),
        });

        if (!attachResponse.ok) {
          const apiError = await parseApiError(attachResponse);
          const mapped = mapApiErrors(attachResponse.status, apiError);
          setFormError(
            mapped.formError ?? "Story was created but could not be added to the backlog.",
          );
          return;
        }

        onSaved(createdStoryId);
        return;
      }

      const updateResponse = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!updateResponse.ok) {
        const apiError = await parseApiError(updateResponse);
        const mapped = mapApiErrors(updateResponse.status, apiError);
        setFieldErrors(mapped.fieldErrors);
        setFormError(mapped.formError);
        return;
      }

      onSaved(storyId!);
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
        {fieldErrors.title && <p className="text-xs text-red-300">{fieldErrors.title}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="story-type" className="text-xs text-muted-foreground">
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
          <label htmlFor="story-priority" className="text-xs text-muted-foreground">
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
        {fieldErrors.epic_id && <p className="text-xs text-red-300">{fieldErrors.epic_id}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor="story-description" className="text-xs text-muted-foreground">
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
          <label htmlFor="story-blocked-reason" className="text-xs text-muted-foreground">
            Blocked reason
          </label>
          <textarea
            id="story-blocked-reason"
            value={values.blocked_reason}
            disabled={isSubmitting}
            onChange={(event) => updateValue("blocked_reason", event.target.value)}
            rows={2}
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus-ring"
            placeholder="Leave empty to mark story as not blocked."
          />
          {fieldErrors.blocked_reason && (
            <p className="text-xs text-red-300">{fieldErrors.blocked_reason}</p>
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
