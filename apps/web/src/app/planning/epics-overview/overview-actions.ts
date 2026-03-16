/**
 * API action helpers for the epics overview page.
 * Handles error parsing and user-friendly error messages.
 */

async function parseApiErrorPayload(
  response: Response,
): Promise<{ code?: string; message?: string }> {
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    return {
      code: payload.error?.code,
      message: payload.error?.message,
    };
  } catch {
    return {};
  }
}

export async function toActionHttpErrorMessage(
  response: Response,
  action: "status" | "add-to-sprint",
): Promise<string> {
  const payload = await parseApiErrorPayload(response);
  const code = payload.code;
  const message = payload.message;

  if (code === "UNAUTHORIZED") {
    return "Authentication is required to perform this action.";
  }
  if (code === "FORBIDDEN") {
    return "You do not have permission to perform this action.";
  }
  if (code === "UNPROCESSABLE_ENTITY") {
    return action === "status"
      ? "Status update request is invalid. Refresh and try again."
      : "Add-to-sprint request is invalid. Refresh and try again.";
  }
  if (code === "VALIDATION_ERROR") {
    return action === "add-to-sprint"
      ? "Select a single project before adding a story to sprint."
      : "Status update validation failed.";
  }
  if (message && message.trim().length > 0) {
    return message;
  }
  return action === "status"
    ? `Failed to update story status. HTTP ${response.status}.`
    : `Failed to add story to sprint. HTTP ${response.status}.`;
}

export function toBulkResultErrorMessage(
  result: { error_code?: string | null; error_message?: string | null },
  action: "status" | "add-to-sprint",
): string {
  if (result.error_message && result.error_message.trim().length > 0) {
    return result.error_message;
  }

  if (result.error_code === "UNAUTHORIZED") {
    return "Authentication is required to perform this action.";
  }
  if (result.error_code === "FORBIDDEN") {
    return "You do not have permission to perform this action.";
  }
  if (result.error_code === "UNPROCESSABLE_ENTITY") {
    return action === "status"
      ? "Status update request is invalid. Refresh and try again."
      : "Add-to-sprint request is invalid. Refresh and try again.";
  }
  if (result.error_code === "NO_ACTIVE_SPRINT") {
    return "No active sprint is available for this project.";
  }
  if (result.error_code === "BUSINESS_RULE_VIOLATION") {
    return action === "status"
      ? "Story status cannot be changed in the current state."
      : "Story cannot be added to active sprint from its current backlog.";
  }

  return action === "status"
    ? "Failed to update story status."
    : "Failed to add story to sprint.";
}
