"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { PlanningCreateButton } from "./planning-create-button";
import { StoryForm } from "./story-form";

interface PlanningCreateActionProps {
  projectId: string | null;
  backlogId?: string;
  disabled?: boolean;
  onSaved?: (storyId: string) => void;
}

export function PlanningCreateAction({
  projectId,
  backlogId,
  disabled = false,
  onSaved,
}: PlanningCreateActionProps) {
  const [open, setOpen] = useState(false);

  const handleSaved = (storyId: string) => {
    setOpen(false);
    onSaved?.(storyId);
  };

  return (
    <>
      <PlanningCreateButton
        tooltip="Create work item"
        disabled={disabled || !projectId}
        onClick={() => setOpen(true)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create work item</DialogTitle>
          </DialogHeader>
          {projectId && (
            <StoryForm
              mode="create"
              projectId={projectId}
              backlogId={backlogId}
              onSaved={handleSaved}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
