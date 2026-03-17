import { apiUrl } from "@/lib/api-client";

export interface ListEnvelope<T> {
  data: T[];
}

export interface PlanningProject {
  id: string;
  key: string;
  name: string;
}

export interface PlanningLabel {
  id: string;
  project_id: string | null;
  name: string;
  color: string | null;
}

export type Notice = {
  kind: "success" | "error";
  message: string;
};

export const PROJECT_KEY = "MC";

export function noticeStyle(kind: Notice["kind"]): string {
  if (kind === "success") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  return "border-red-500/40 bg-red-500/10 text-red-200";
}

async function toApiErrorMessage(response: Response, fallbackAction: string): Promise<string> {
  if (response.status === 409) {
    return "A label with this name already exists in this scope.";
  }
  if (response.status === 422) {
    return "Label name is invalid. Use 1-100 characters.";
  }
  if (response.status >= 500) {
    return "Server error while processing labels. Please try again.";
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  if (payload?.error?.message) {
    return payload.error.message;
  }
  return `Failed to ${fallbackAction}. HTTP ${response.status}.`;
}

export async function getProjectByKey(key: string): Promise<PlanningProject> {
  const response = await fetch(
    apiUrl(`/v1/planning/projects?key=${encodeURIComponent(key)}&limit=1`),
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, "load project"));
  }

  const payload = (await response.json()) as ListEnvelope<PlanningProject>;
  const project = payload.data[0] ?? null;
  if (!project) {
    throw new Error(`Project ${key} was not found.`);
  }
  return project;
}

export async function listLabelsByProjectKey(projectKey: string): Promise<PlanningLabel[]> {
  const response = await fetch(
    apiUrl(`/v1/planning/labels?project_key=${encodeURIComponent(projectKey)}&limit=100`),
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, "load labels"));
  }

  const payload = (await response.json()) as ListEnvelope<PlanningLabel>;
  return payload.data;
}

export async function createLabel(input: {
  projectId: string;
  name: string;
  color: string | null;
}): Promise<void> {
  const response = await fetch(apiUrl("/v1/planning/labels"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project_id: input.projectId,
      name: input.name,
      color: input.color,
    }),
  });

  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, "create label"));
  }
}

export async function updateLabel(input: {
  labelId: string;
  name: string;
  color: string | null;
}): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/labels/${input.labelId}`), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: input.name, color: input.color }),
  });

  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, "update label"));
  }
}

export async function removeLabel(labelId: string): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/labels/${labelId}`), {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, "delete label"));
  }
}
