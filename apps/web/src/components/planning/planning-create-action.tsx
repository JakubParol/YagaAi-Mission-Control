"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { StoryForm } from "./story-form";

interface PlanningCreateActionProps {
  projectId: string | null;
  backlogId?: string;
  disabled?: boolean;
  label?: string;
  onSaved?: (storyId: string) => void;
}

export function PlanningCreateAction({
  projectId,
  backlogId,
  disabled = false,
  label = "Create",
  onSaved,
}: PlanningCreateActionProps) {
  const [open, setOpen] = useState(false);

  const handleSaved = (storyId: string) => {
    setOpen(false);
    onSaved?.(storyId);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !projectId}
        onClick={() => setOpen(true)}
        className="gap-1.5 whitespace-nowrap"
      >
        <Plus className="size-3.5" />
        {label}
      </Button>

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
