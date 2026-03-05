import { apiUrl } from "@/lib/api-client";

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

export async function toStoryDeleteErrorMessage(response: Response): Promise<string> {
  const payload = await parseErrorPayload(response);
  const code = payload.error?.code;
  const apiMessage = payload.error?.message;

  if (code === "NOT_FOUND") {
    return "Story was not found. Refresh and try again.";
  }

  if (code === "BUSINESS_RULE_VIOLATION") {
    if (apiMessage && apiMessage.trim().length > 0) {
      return apiMessage;
    }
    return "This story cannot be deleted.";
  }

  if (code === "FORBIDDEN") {
    return "You do not have permission to delete this story.";
  }

  if (code === "UNAUTHORIZED") {
    return "Authentication is required to delete stories.";
  }

  if (apiMessage && apiMessage.trim().length > 0) {
    return apiMessage;
  }

  return `Failed to delete story. HTTP ${response.status}.`;
}

export async function deleteStory(storyId: string): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/stories/${storyId}`), {
    method: "DELETE",
  });

  if (response.ok) return;
  const message = await toStoryDeleteErrorMessage(response);
  throw new Error(message);
}
