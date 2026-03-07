"use client";

import { useMemo, useState } from "react";
import { User } from "lucide-react";

import { AvatarOption } from "@/components/planning/avatar-option";
import { AssigneeAvatarTooltip } from "@/components/planning/assignee-avatar-tooltip";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ui/themed-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface StoryAssigneeOption {
  id: string;
  name: string;
  last_name: string | null;
  initials: string | null;
  role: string | null;
  avatar: string | null;
}

export interface StoryAssigneeSelection {
  assignee_agent_id: string | null;
  assignee_name: string | null;
  assignee_last_name: string | null;
  assignee_initials: string | null;
  assignee_avatar: string | null;
}

const UNASSIGNED_OPTION = "__UNASSIGNED__";

type AssigneePickerOption = ThemedSelectOption & {
  name: string;
  lastName: string | null;
  initials: string | null;
  role: string | null;
  avatar: string | null;
  isUnassigned?: boolean;
};

function buildAssigneePickerOptions(
  assigneeOptions: readonly StoryAssigneeOption[],
): AssigneePickerOption[] {
  return [
    {
      value: UNASSIGNED_OPTION,
      label: "Unassigned",
      name: "Unassigned",
      lastName: null,
      initials: null,
      role: null,
      avatar: null,
      isUnassigned: true,
    },
    ...assigneeOptions.map((option) => ({
      value: option.id,
      label: option.role ? `${option.name} · ${option.role}` : option.name,
      name: option.name,
      lastName: option.last_name,
      initials: option.initials,
      role: option.role,
      avatar: option.avatar,
    })),
  ];
}

export function StoryAssigneeControl({
  storyId,
  currentAssignee,
  assigneeOptions,
  onChange,
  disabled = false,
}: {
  storyId: string;
  currentAssignee: StoryAssigneeSelection;
  assigneeOptions: readonly StoryAssigneeOption[];
  onChange: (storyId: string, assignee: StoryAssigneeSelection) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerOptions = useMemo(
    () => buildAssigneePickerOptions(assigneeOptions),
    [assigneeOptions],
  );
  const selectedValue = currentAssignee.assignee_agent_id ?? UNASSIGNED_OPTION;
  const selectedName = currentAssignee.assignee_name ?? "Unassigned";
  const isUnassigned =
    currentAssignee.assignee_agent_id === null
    && !currentAssignee.assignee_name
    && !currentAssignee.assignee_last_name
    && !currentAssignee.assignee_initials
    && !currentAssignee.assignee_avatar;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          disabled={disabled}
          aria-label={`Select assignee. Current assignee: ${selectedName}`}
          className="group/assignee relative"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {isUnassigned ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full border border-border/70 bg-muted text-muted-foreground"
                  aria-label="Unassigned"
                >
                  <User className="size-3" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Unassigned</TooltipContent>
            </Tooltip>
          ) : (
            <AssigneeAvatarTooltip
              name={selectedName}
              lastName={currentAssignee.assignee_last_name}
              initials={currentAssignee.assignee_initials}
              avatar={currentAssignee.assignee_avatar}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[280px] p-2"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="mb-2 px-1 text-[11px] font-medium text-muted-foreground">
          Assignee
        </p>
        <ThemedSelect
          value={selectedValue}
          options={pickerOptions}
          placeholder="Select assignee"
          disabled={disabled}
          renderOption={(option) => {
            const assignee = option as AssigneePickerOption;
            if (assignee.isUnassigned) return "Unassigned";
            return (
              <AvatarOption
                name={assignee.name}
                lastName={assignee.lastName}
                initials={assignee.initials}
                role={assignee.role}
                avatar={assignee.avatar}
              />
            );
          }}
          renderValue={(option) => {
            const assignee = option as AssigneePickerOption;
            if (assignee.isUnassigned) return "Unassigned";
            return (
              <AvatarOption
                name={assignee.name}
                lastName={assignee.lastName}
                initials={assignee.initials}
                avatar={assignee.avatar}
                compact
              />
            );
          }}
          onValueChange={(value) => {
            const assignee = pickerOptions.find((option) => option.value === value);
            if (!assignee || assignee.isUnassigned) {
              onChange(storyId, {
                assignee_agent_id: null,
                assignee_name: null,
                assignee_last_name: null,
                assignee_initials: null,
                assignee_avatar: null,
              });
              setIsOpen(false);
              return;
            }
            onChange(storyId, {
              assignee_agent_id: String(assignee.value),
              assignee_name: assignee.name,
              assignee_last_name: assignee.lastName,
              assignee_initials: assignee.initials,
              assignee_avatar: assignee.avatar,
            });
            setIsOpen(false);
          }}
          triggerClassName="h-8 text-xs"
        />
      </PopoverContent>
    </Popover>
  );
}
