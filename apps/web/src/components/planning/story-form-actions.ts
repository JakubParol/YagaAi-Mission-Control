/**
 * API call helpers and error mapping for the story create/edit form.
 * Keeps fetch logic out of the UI component.
 */

import { apiUrl } from "@/lib/api-client";

// ── Types ────────────────────────────────────────────────────────────────────

export type StoryFormMode = "create" | "edit";

export interface StoryFormValues {
  title: string;
  story_type: string;
  description: string;
  priority: string;
  epic_id: string;
  blocked_reason: string;
}

export interface StoryFormFieldErrors {
  title?: string;
  story_type?: string;
  description?: string;
  priority?: string;
  epic_id?: string;
  blocked_reason?: string;
}

export interface StoryFormProps {
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

export const STORY_TYPE_OPTIONS = [
  { value: "USER_STORY", label: "Story" },
  { value: "BUG", label: "Bug" },
  { value: "SPIKE", label: "Spike" },
  { value: "CHORE", label: "Chore" },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function initialFormValues(
  initialValues?: Partial<StoryFormValues>,
): StoryFormValues {
  return {
    title: initialValues?.title ?? "",
    story_type: initialValues?.story_type ?? "USER_STORY",
    description: initialValues?.description ?? "",
    priority: initialValues?.priority ?? "",
    epic_id: initialValues?.epic_id ?? "",
    blocked_reason: initialValues?.blocked_reason ?? "",
  };
}

// ── Error mapping ────────────────────────────────────────────────────────────

async function parseApiError(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

function toFieldKey(
  loc: Array<string | number> | undefined,
): keyof StoryFormFieldErrors | null {
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

  return {
    formError: `Request failed. HTTP ${responseStatus}.`,
    fieldErrors,
  };
}

// ── Submission result ────────────────────────────────────────────────────────

export interface SubmitResult {
  ok: boolean;
  storyId?: string;
  formError?: string | null;
  fieldErrors?: StoryFormFieldErrors;
}

// ── Build payload ────────────────────────────────────────────────────────────

function buildPayload(
  mode: StoryFormMode,
  values: StoryFormValues,
  projectId: string | null,
): Record<string, unknown> {
  const normalizedTitle = values.title.trim();
  const normalizedDescription = values.description.trim();
  const normalizedBlockedReason = values.blocked_reason.trim();
  const parsedPriority =
    values.priority.trim() === "" ? null : Number(values.priority);

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

  return payload;
}

// ── API calls ────────────────────────────────────────────────────────────────

async function handleErrorResponse(response: Response): Promise<SubmitResult> {
  const apiError = await parseApiError(response);
  const mapped = mapApiErrors(response.status, apiError);
  return {
    ok: false,
    formError: mapped.formError,
    fieldErrors: mapped.fieldErrors,
  };
}

export async function createStory(
  values: StoryFormValues,
  projectId: string,
  backlogId: string,
): Promise<SubmitResult> {
  const payload = buildPayload("create", values, projectId);

  const createResponse = await fetch(apiUrl("/v1/planning/stories"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!createResponse.ok) return handleErrorResponse(createResponse);

  const createBody = await createResponse.json();
  const createdStoryId: string | undefined = createBody?.data?.id;
  if (!createdStoryId) {
    return {
      ok: false,
      formError: "Story creation succeeded but response has no story id.",
    };
  }

  const attachResponse = await fetch(
    apiUrl(`/v1/planning/backlogs/${backlogId}/stories`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story_id: createdStoryId, position: 0 }),
    },
  );

  if (!attachResponse.ok) {
    const apiError = await parseApiError(attachResponse);
    const mapped = mapApiErrors(attachResponse.status, apiError);
    return {
      ok: false,
      formError:
        mapped.formError ??
        "Story was created but could not be added to the backlog.",
    };
  }

  return { ok: true, storyId: createdStoryId };
}

export async function updateStory(
  values: StoryFormValues,
  storyId: string,
): Promise<SubmitResult> {
  const payload = buildPayload("edit", values, null);

  const updateResponse = await fetch(
    apiUrl(`/v1/planning/stories/${storyId}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!updateResponse.ok) return handleErrorResponse(updateResponse);

  return { ok: true, storyId };
}
