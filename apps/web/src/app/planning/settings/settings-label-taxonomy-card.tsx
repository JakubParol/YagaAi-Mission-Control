"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ListEnvelope<T> {
  data: T[];
}

interface PlanningProject {
  id: string;
  key: string;
  name: string;
}

interface PlanningLabel {
  id: string;
  project_id: string | null;
  name: string;
  color: string | null;
}

type Notice = {
  kind: "success" | "error";
  message: string;
};

const PROJECT_KEY = "MC";

function noticeStyle(kind: Notice["kind"]): string {
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

  const payload = await response
    .json()
    .catch(() => null) as { error?: { message?: string } } | null;
  if (payload?.error?.message) {
    return payload.error.message;
  }
  return `Failed to ${fallbackAction}. HTTP ${response.status}.`;
}

async function getProjectByKey(key: string): Promise<PlanningProject> {
  const response = await fetch(apiUrl(`/v1/planning/projects?key=${encodeURIComponent(key)}&limit=1`), {
    cache: "no-store",
  });
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

async function listLabelsByProjectKey(projectKey: string): Promise<PlanningLabel[]> {
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

async function createLabel(input: {
  projectId: string;
  name: string;
  color: string | null;
}): Promise<void> {
  const response = await fetch(apiUrl("/v1/planning/labels"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
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

async function updateLabel(input: { labelId: string; name: string; color: string | null }): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/labels/${input.labelId}`), {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      color: input.color,
    }),
  });

  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, "update label"));
  }
}

async function removeLabel(labelId: string): Promise<void> {
  const response = await fetch(apiUrl(`/v1/planning/labels/${labelId}`), {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, "delete label"));
  }
}

export function SettingsLabelTaxonomyCard() {
  const [project, setProject] = useState<PlanningProject | null>(null);
  const [labels, setLabels] = useState<PlanningLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyLabelId, setBusyLabelId] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState("");
  const [editLabelId, setEditLabelId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const hasLabels = labels.length > 0;

  const sortedLabels = useMemo(() => {
    return [...labels].sort((left, right) => left.name.localeCompare(right.name));
  }, [labels]);

  const loadInitial = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);

    try {
      const selectedProject = await getProjectByKey(PROJECT_KEY);
      const projectLabels = await listLabelsByProjectKey(selectedProject.key);
      setProject(selectedProject);
      setLabels(projectLabels);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load label taxonomy.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  async function refreshLabels(): Promise<void> {
    if (!project) return;
    const projectLabels = await listLabelsByProjectKey(project.key);
    setLabels(projectLabels);
  }

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function onCreateLabel(): Promise<void> {
    if (!project) return;

    const normalizedName = createName.trim();
    const normalizedColor = createColor.trim();
    if (normalizedName.length === 0) {
      setNotice({
        kind: "error",
        message: "Label name is required.",
      });
      return;
    }

    setCreating(true);
    setNotice(null);
    try {
      await createLabel({
        projectId: project.id,
        name: normalizedName,
        color: normalizedColor.length > 0 ? normalizedColor : null,
      });
      await refreshLabels();
      setCreateName("");
      setCreateColor("");
      setNotice({
        kind: "success",
        message: "Label created.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to create label.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function onSaveLabel(): Promise<void> {
    if (!editLabelId) return;

    const normalizedName = editName.trim();
    const normalizedColor = editColor.trim();
    if (normalizedName.length === 0) {
      setNotice({
        kind: "error",
        message: "Label name is required.",
      });
      return;
    }

    setBusyLabelId(editLabelId);
    setNotice(null);
    try {
      await updateLabel({
        labelId: editLabelId,
        name: normalizedName,
        color: normalizedColor.length > 0 ? normalizedColor : null,
      });
      await refreshLabels();
      setEditLabelId(null);
      setEditName("");
      setEditColor("");
      setNotice({
        kind: "success",
        message: "Label updated.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to update label.",
      });
    } finally {
      setBusyLabelId(null);
    }
  }

  async function onDeleteLabel(label: PlanningLabel): Promise<void> {
    const confirmed = window.confirm(`Delete label "${label.name}"?`);
    if (!confirmed) return;

    setBusyLabelId(label.id);
    setNotice(null);
    try {
      await removeLabel(label.id);
      await refreshLabels();
      if (editLabelId === label.id) {
        setEditLabelId(null);
        setEditName("");
        setEditColor("");
      }
      setNotice({
        kind: "success",
        message: "Label deleted.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to delete label.",
      });
    } finally {
      setBusyLabelId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Label taxonomy</CardTitle>
        <CardDescription>
          Real labels from API for project <code>{PROJECT_KEY}</code>, including create, rename,
          and delete.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {notice ? (
          <div className={`rounded border px-3 py-2 text-xs ${noticeStyle(notice.kind)}`}>
            {notice.message}
          </div>
        ) : null}

        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <p className="font-semibold">Create label</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
            <input
              className="h-9 rounded border border-border/60 bg-background px-2 text-xs"
              placeholder="Label name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              disabled={creating || loading || !project}
              aria-label="New label name"
            />
            <input
              className="h-9 rounded border border-border/60 bg-background px-2 text-xs"
              placeholder="#22c55e"
              value={createColor}
              onChange={(event) => setCreateColor(event.target.value)}
              disabled={creating || loading || !project}
              aria-label="New label color"
            />
            <Button
              size="sm"
              onClick={() => void onCreateLabel()}
              disabled={creating || loading || !project}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
          <p className="text-muted-foreground">
            Scope: {project ? `${project.key} (${project.name})` : "Loading project..."}
          </p>
        </div>

        {loadError ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-200">
            {loadError}
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => void loadInitial()}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {!loadError && loading ? (
          <p className="text-muted-foreground">Loading labels...</p>
        ) : null}

        {!loadError && !loading && !hasLabels ? (
          <p className="text-muted-foreground">No labels available for this project scope.</p>
        ) : null}

        {!loadError && !loading && hasLabels ? (
          <div className="space-y-2">
            {sortedLabels.map((label) => {
              const isEditing = editLabelId === label.id;
              const isBusy = busyLabelId === label.id;
              return (
                <div
                  key={label.id}
                  className="rounded-md border border-border/60 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    {isEditing ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                        <input
                          className="h-8 rounded border border-border/60 bg-background px-2 text-xs"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          disabled={isBusy}
                          aria-label="Edit label name"
                        />
                        <input
                          className="h-8 rounded border border-border/60 bg-background px-2 text-xs"
                          value={editColor}
                          onChange={(event) => setEditColor(event.target.value)}
                          disabled={isBusy}
                          aria-label="Edit label color"
                        />
                      </div>
                    ) : (
                      <p className="font-semibold truncate">{label.name}</p>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-border/60"
                        style={{ backgroundColor: label.color ?? "transparent" }}
                        aria-label={`Color ${label.color ?? "none"}`}
                      />
                      <span>{label.project_id ? "project-scoped" : "global"}</span>
                      <span>{label.color ?? "no color"}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => void onSaveLabel()}
                        >
                          {isBusy ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => {
                            setEditLabelId(null);
                            setEditName("");
                            setEditColor("");
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => {
                          setEditLabelId(label.id);
                          setEditName(label.name);
                          setEditColor(label.color ?? "");
                        }}
                      >
                        Rename
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void onDeleteLabel(label)}
                    >
                      {isBusy ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between border-t">
        <Badge variant="outline">{labels.length} labels</Badge>
        <Badge variant="outline">Live API</Badge>
      </CardFooter>
    </Card>
  );
}
