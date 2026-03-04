import { apiUrl } from "@/lib/api-client";
import type { BacklogKind } from "@/lib/planning/types";

export type BoardMutationOperation = "create" | "delete";

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export interface CreateBoardInput {
  projectId: string;
  name: string;
  kind: BacklogKind;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

export async function toBoardMutationErrorMessage(
  response: Response,
  operation: BoardMutationOperation,
): Promise<string> {
  const payload = await parseErrorPayload(response);
  const code = payload.error?.code;
  const apiMessage = payload.error?.message;

  if (code === "VALIDATION_ERROR") {
    return "Select a single project before managing boards.";
  }

  if (code === "NOT_FOUND") {
    return operation === "delete"
      ? "Board was not found. Refresh and try again."
      : "Project or board context was not found. Refresh and try again.";
  }

  if (code === "BUSINESS_RULE_VIOLATION") {
    if (apiMessage && apiMessage.trim().length > 0) {
      return apiMessage;
    }
    return operation === "delete"
      ? "This board cannot be deleted."
      : "Board cannot be created with the provided data.";
  }

  if (code === "FORBIDDEN") {
    return "You do not have permission to manage boards for this project.";
  }

  if (code === "UNAUTHORIZED") {
    return "Authentication is required to manage boards.";
  }

  if (apiMessage && apiMessage.trim().length > 0) {
    return apiMessage;
  }

  const action = operation === "create" ? "create board" : "delete board";
  return `Failed to ${action}. HTTP ${response.status}.`;
}

async function assertBoardMutationResponse(
  response: Response,
  operation: BoardMutationOperation,
): Promise<void> {
  if (response.ok) return;
  const message = await toBoardMutationErrorMessage(response, operation);
  throw new Error(message);
}

export async function createBoard(input: CreateBoardInput): Promise<void> {
  const response = await fetch(apiUrl("/v1/planning/backlogs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: input.projectId,
      name: input.name,
      kind: input.kind,
      goal: input.goal ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
    }),
  });

  await assertBoardMutationResponse(response, "create");
}

export async function deleteBoard(backlogId: string): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/backlogs/${backlogId}`), {
    method: "DELETE",
  });

  await assertBoardMutationResponse(response, "delete");
}
