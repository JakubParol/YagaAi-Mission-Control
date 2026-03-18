import { apiUrl } from "@/lib/api-client";

export type SprintMembershipOperation = "add" | "remove";

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const body = (await response.json()) as ApiErrorPayload;
    return body;
  } catch {
    return {};
  }
}

export async function toSprintMembershipErrorMessage(
  response: Response,
  operation: SprintMembershipOperation,
): Promise<string> {
  const payload = await parseErrorPayload(response);
  const code = payload.error?.code;
  const apiMessage = payload.error?.message;
  const fallbackAction = operation === "add" ? "add story to active sprint" : "remove story from active sprint";

  if (code === "VALIDATION_ERROR") {
    return "Select a single project before updating sprint membership.";
  }

  if (code === "NOT_FOUND") {
    return "Active sprint or story was not found. Refresh and try again.";
  }

  if (code === "BUSINESS_RULE_VIOLATION") {
    if (apiMessage && apiMessage.trim().length > 0) {
      return apiMessage;
    }
    return operation === "add"
      ? "Only stories in the product backlog can be added to the active sprint."
      : "Only stories already in the active sprint can be removed.";
  }

  if (code === "FORBIDDEN") {
    return "You do not have permission to update sprint membership for this project.";
  }

  if (code === "UNAUTHORIZED") {
    return "Authentication is required to update sprint membership.";
  }

  if (apiMessage && apiMessage.trim().length > 0) {
    return apiMessage;
  }

  return `Failed to ${fallbackAction}. HTTP ${response.status}.`;
}

async function assertSprintMembershipResponse(
  response: Response,
  operation: SprintMembershipOperation,
): Promise<void> {
  if (response.ok) return;
  const message = await toSprintMembershipErrorMessage(response, operation);
  throw new Error(message);
}

export async function addStoryToActiveSprint(projectId: string, storyId: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/v1/planning/backlogs/active-sprint/items?project_id=${projectId}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ work_item_id: storyId }),
    },
  );

  await assertSprintMembershipResponse(response, "add");
}

export async function removeStoryFromActiveSprint(projectId: string, storyId: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/v1/planning/backlogs/active-sprint/items/${storyId}?project_id=${projectId}`),
    {
      method: "DELETE",
    },
  );

  await assertSprintMembershipResponse(response, "remove");
}
