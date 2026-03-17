"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { Notice, PlanningProject } from "./settings-label-actions";
import { createLabel } from "./settings-label-actions";

interface LabelCreateFormProps {
  project: PlanningProject | null;
  loading: boolean;
  onCreated: () => Promise<void>;
  onNotice: (notice: Notice) => void;
}

export function LabelCreateForm({ project, loading, onCreated, onNotice }: LabelCreateFormProps) {
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState("");

  const disabled = creating || loading || !project;

  async function onCreateLabel(): Promise<void> {
    if (!project) return;

    const normalizedName = createName.trim();
    const normalizedColor = createColor.trim();
    if (normalizedName.length === 0) {
      onNotice({ kind: "error", message: "Label name is required." });
      return;
    }

    setCreating(true);
    onNotice({ kind: "success", message: "" }); // clear previous
    try {
      await createLabel({
        projectId: project.id,
        name: normalizedName,
        color: normalizedColor.length > 0 ? normalizedColor : null,
      });
      await onCreated();
      setCreateName("");
      setCreateColor("");
      onNotice({ kind: "success", message: "Label created." });
    } catch (error) {
      onNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to create label.",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-md border border-border/60 p-3 space-y-2">
      <p className="font-semibold">Create label</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
        <input
          className="h-9 rounded border border-border/60 bg-background px-2 text-xs"
          placeholder="Label name"
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
          disabled={disabled}
          aria-label="New label name"
        />
        <input
          className="h-9 rounded border border-border/60 bg-background px-2 text-xs"
          placeholder="#22c55e"
          value={createColor}
          onChange={(event) => setCreateColor(event.target.value)}
          disabled={disabled}
          aria-label="New label color"
        />
        <Button size="sm" onClick={() => void onCreateLabel()} disabled={disabled}>
          {creating ? "Creating..." : "Create"}
        </Button>
      </div>
      <p className="text-muted-foreground">
        Scope: {project ? `${project.key} (${project.name})` : "Loading project..."}
      </p>
    </div>
  );
}
