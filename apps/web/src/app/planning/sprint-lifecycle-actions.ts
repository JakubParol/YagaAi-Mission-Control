import { apiUrl } from "@/lib/api-client";

export type SprintLifecycleOperation = "start" | "complete";

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

export async function toSprintLifecycleErrorMessage(
  response: Response,
  operation: SprintLifecycleOperation,
): Promise<string> {
  const payload = await parseErrorPayload(response);
  const code = payload.error?.code;
  const apiMessage = payload.error?.message;

  if (code === "VALIDATION_ERROR") {
    return "Select a single project before changing sprint status.";
  }

  if (code === "NOT_FOUND") {
    return "Sprint was not found. Refresh and try again.";
  }

  if (code === "CONFLICT") {
    return "Another sprint is already active for this project.";
  }

  if (code === "BUSINESS_RULE_VIOLATION") {
    if (apiMessage && apiMessage.trim().length > 0) {
      return apiMessage;
    }
    return operation === "start"
      ? "Only closed sprints can be started."
      : "Sprint can be completed only when all sprint stories are DONE.";
  }

  if (code === "FORBIDDEN") {
    return "You do not have permission to change sprint status for this project.";
  }

  if (code === "UNAUTHORIZED") {
    return "Authentication is required to change sprint status.";
  }

  if (apiMessage && apiMessage.trim().length > 0) {
    return apiMessage;
  }

  return `Failed to ${operation} sprint. HTTP ${response.status}.`;
}

async function assertSprintLifecycleResponse(
  response: Response,
  operation: SprintLifecycleOperation,
): Promise<void> {
  if (response.ok) return;
  const message = await toSprintLifecycleErrorMessage(response, operation);
  throw new Error(message);
}

export async function startSprint(projectId: string, backlogId: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/v1/planning/backlogs/${backlogId}/start?project_id=${projectId}`),
    { method: "POST" },
  );

  await assertSprintLifecycleResponse(response, "start");
}

export async function completeSprint(projectId: string, backlogId: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/v1/planning/backlogs/${backlogId}/complete?project_id=${projectId}`),
    { method: "POST" },
  );

  await assertSprintLifecycleResponse(response, "complete");
}
