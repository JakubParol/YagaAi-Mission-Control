import type { StoryCardStory } from "@/components/planning/story-card";
import { apiUrl } from "@/lib/api-client";

export type QuickCreateWorkType = "USER_STORY" | "TASK" | "BUG";

export interface QuickCreateAssigneeOption {
  id: string;
  name: string;
  role: string | null;
  openclaw_key: string;
}

export interface QuickCreateSubmitInput {
  projectId: string;
  subject: string;
  workType: QuickCreateWorkType;
  assigneeAgentId: string | null;
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

type QuickCreatePhase = "create" | "attach";

export function validateQuickCreateSubject(subject: string): string | null {
  if (subject.trim().length === 0) {
    return "Subject is required."
  }
  return null
}

export function isQuickCreateSubmitKey(key: string, shiftKey: boolean): boolean {
  return key === "Enter" && !shiftKey
}

export function isQuickCreateCancelKey(key: string): boolean {
  return key === "Escape"
}

function buildMetadataJson(assigneeAgentId: string | null): string | null {
  if (!assigneeAgentId) return null

  return JSON.stringify({
    quick_create_assignee_agent_id: assigneeAgentId,
    quick_create_source: "board_todo_column",
  })
}

export function buildStoryCreatePayload(input: QuickCreateSubmitInput): Record<string, unknown> {
  return {
    title: input.subject.trim(),
    story_type: input.workType,
    project_id: input.projectId,
    metadata_json: buildMetadataJson(input.assigneeAgentId),
  }
}

async function parseApiError(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload
  } catch {
    return {}
  }
}

function getValidationDetail(payload: ApiErrorPayload): string | null {
  if (!Array.isArray(payload.detail)) return null

  for (const item of payload.detail) {
    if (!item.msg) continue
    const key = String(item.loc?.[1] ?? "")
    if (key === "title" || key === "story_type" || key === "project_id") {
      return item.msg
    }
  }
  return payload.detail[0]?.msg ?? null
}

export async function toQuickCreateErrorMessage(
  response: Response,
  phase: QuickCreatePhase,
): Promise<string> {
  const payload = await parseApiError(response)
  const detailMessage = getValidationDetail(payload)
  if (detailMessage) return detailMessage

  const code = payload.error?.code
  const apiMessage = payload.error?.message

  if (code === "VALIDATION_ERROR") {
    return "Select a single project before creating work."
  }

  if (code === "NOT_FOUND") {
    return phase === "create"
      ? "Project context was not found. Refresh and try again."
      : "Active sprint was not found for the selected project."
  }

  if (code === "BUSINESS_RULE_VIOLATION") {
    if (apiMessage && apiMessage.trim().length > 0) return apiMessage
    return phase === "create"
      ? "Work item cannot be created with the provided values."
      : "Work item was created but could not be added to the active sprint."
  }

  if (code === "FORBIDDEN") {
    return "You do not have permission to create work items."
  }

  if (code === "UNAUTHORIZED") {
    return "Authentication is required to create work items."
  }

  if (apiMessage && apiMessage.trim().length > 0) return apiMessage

  return phase === "create"
    ? `Failed to create work item. HTTP ${response.status}.`
    : `Work item was created but could not be added to the active sprint. HTTP ${response.status}.`
}

interface StoryCreateEnvelope {
  data?: {
    id?: string;
    key?: string | null;
    title?: string;
    status?: StoryCardStory["status"];
    priority?: number | null;
    story_type?: string;
  };
}

export async function createTodoQuickItem(input: QuickCreateSubmitInput): Promise<StoryCardStory> {
  const validationError = validateQuickCreateSubject(input.subject)
  if (validationError) throw new Error(validationError)

  const payload = buildStoryCreatePayload(input)
  const createResponse = await fetch(apiUrl("/v1/planning/stories"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!createResponse.ok) {
    throw new Error(await toQuickCreateErrorMessage(createResponse, "create"))
  }

  const createBody = (await createResponse.json()) as StoryCreateEnvelope
  const createdStory = createBody.data
  if (!createdStory?.id) {
    throw new Error("Work item was created but response has no story id.")
  }

  const attachResponse = await fetch(
    apiUrl(`/v1/planning/backlogs/active-sprint/stories?project_id=${input.projectId}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story_id: createdStory.id, position: 0 }),
    },
  )
  if (!attachResponse.ok) {
    throw new Error(await toQuickCreateErrorMessage(attachResponse, "attach"))
  }

  return {
    id: createdStory.id,
    key: createdStory.key ?? null,
    title: createdStory.title ?? input.subject.trim(),
    status: createdStory.status ?? "TODO",
    priority: createdStory.priority ?? null,
    story_type: createdStory.story_type ?? input.workType,
    position: 0,
    task_count: 0,
    done_task_count: 0,
    labels: [],
    label_ids: [],
  }
}
