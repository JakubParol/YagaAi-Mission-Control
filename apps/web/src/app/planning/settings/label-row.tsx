"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { Notice, PlanningLabel } from "./settings-label-actions";
import { removeLabel, updateLabel } from "./settings-label-actions";

interface LabelRowProps {
  label: PlanningLabel;
  onMutated: () => Promise<void>;
  onNotice: (notice: Notice) => void;
}

export function LabelRow({ label, onMutated, onNotice }: LabelRowProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  function startEditing(): void {
    setEditing(true);
    setEditName(label.name);
    setEditColor(label.color ?? "");
  }

  function cancelEditing(): void {
    setEditing(false);
    setEditName("");
    setEditColor("");
  }

  async function onSave(): Promise<void> {
    const normalizedName = editName.trim();
    const normalizedColor = editColor.trim();
    if (normalizedName.length === 0) {
      onNotice({ kind: "error", message: "Label name is required." });
      return;
    }

    setBusy(true);
    try {
      await updateLabel({
        labelId: label.id,
        name: normalizedName,
        color: normalizedColor.length > 0 ? normalizedColor : null,
      });
      await onMutated();
      cancelEditing();
      onNotice({ kind: "success", message: "Label updated." });
    } catch (error) {
      onNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to update label.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(): Promise<void> {
    const confirmed = window.confirm(`Delete label "${label.name}"?`);
    if (!confirmed) return;

    setBusy(true);
    try {
      await removeLabel(label.id);
      await onMutated();
      onNotice({ kind: "success", message: "Label deleted." });
    } catch (error) {
      onNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to delete label.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border/60 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        {editing ? (
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <input
              className="h-8 rounded border border-border/60 bg-background px-2 text-xs"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              disabled={busy}
              aria-label="Edit label name"
            />
            <input
              className="h-8 rounded border border-border/60 bg-background px-2 text-xs"
              value={editColor}
              onChange={(event) => setEditColor(event.target.value)}
              disabled={busy}
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
        {editing ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => void onSave()}>
              {busy ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={cancelEditing}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={startEditing}>
            Rename
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void onDelete()}>
          {busy ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </div>
  );
}
