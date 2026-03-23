"use client";

import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkItemStatus } from "@/lib/planning/types";
import { STATUS_LABEL } from "./story-card";
import { type FloatingCoordinates } from "./story-actions-menu-positioning";
import { SECTION_GROUPS, type MenuActionItem } from "./story-actions-menu-types";

export interface MainMenuPanelProps {
  menuRef: RefObject<HTMLDivElement | null>;
  storyLabel: string;
  mainActions: MenuActionItem[];
  mainActionRefs: RefObject<Array<HTMLButtonElement | null>>;
  menuCoordinates: FloatingCoordinates | null;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onActionClick: (actionId: string, actionIndex: number) => void;
  onActionHover: (actionIndex: number) => void;
}

export function MainMenuPanel({
  menuRef,
  storyLabel,
  mainActions,
  mainActionRefs,
  menuCoordinates,
  onKeyDown,
  onActionClick,
  onActionHover,
}: MainMenuPanelProps) {
  const menuStyle: CSSProperties = {
    position: "fixed",
    top: menuCoordinates?.top ?? 0,
    left: menuCoordinates?.left ?? 0,
    visibility: menuCoordinates ? "visible" : "hidden",
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Story actions for ${storyLabel}`}
      onKeyDown={onKeyDown}
      style={menuStyle}
      className="z-[60] min-w-48 rounded-md border border-border/70 bg-card p-1 shadow-xl"
    >
      {SECTION_GROUPS.map((group, groupIndex) => (
        <div key={`group-${groupIndex}`} className={cn(groupIndex > 0 && "mt-1 border-t border-border/40 pt-1")}>
          {group.map((actionId) => {
            const actionIndex = mainActions.findIndex((item) => item.id === actionId);
            const action = mainActions[actionIndex];
            if (!action) return null;
            const Icon = action.icon;

            return (
              <button
                key={action.id}
                ref={(element) => {
                  mainActionRefs.current[actionIndex] = element;
                }}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
                  action.tone === "danger"
                    ? "text-red-300 hover:bg-red-500/10"
                    : "text-foreground hover:bg-muted/60",
                  action.submenu && "justify-between",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                onMouseEnter={() => onActionHover(actionIndex)}
                onClick={() => {
                  if (action.disabled) return;
                  onActionClick(action.id, actionIndex);
                }}
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-3.5" />
                  {action.label}
                </span>
                {action.submenu && <ChevronRight className="size-3" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface StatusOption {
  status: WorkItemStatus;
  disabled: boolean;
}

export interface StatusSubmenuPanelProps {
  submenuRef: RefObject<HTMLDivElement | null>;
  statusOptions: StatusOption[];
  storyStatus: WorkItemStatus | undefined;
  statusActionRefs: RefObject<Array<HTMLButtonElement | null>>;
  submenuCoordinates: FloatingCoordinates | null;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onStatusClick: (status: WorkItemStatus) => void;
  onStatusHover: (index: number) => void;
}

export function StatusSubmenuPanel({
  submenuRef,
  statusOptions,
  storyStatus,
  statusActionRefs,
  submenuCoordinates,
  onKeyDown,
  onStatusClick,
  onStatusHover,
}: StatusSubmenuPanelProps) {
  const submenuStyle: CSSProperties = {
    position: "fixed",
    top: submenuCoordinates?.top ?? 0,
    left: submenuCoordinates?.left ?? 0,
    visibility: submenuCoordinates ? "visible" : "hidden",
  };

  return (
    <div
      ref={submenuRef}
      role="menu"
      aria-label="Story status options"
      onKeyDown={onKeyDown}
      style={submenuStyle}
      className="z-[70] min-w-44 rounded-md border border-border/70 bg-card p-1 shadow-xl"
    >
      {statusOptions.map((option, index) => (
        <button
          key={option.status}
          ref={(element) => {
            statusActionRefs.current[index] = element;
          }}
          type="button"
          role="menuitem"
          disabled={option.disabled}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
            "text-foreground hover:bg-muted/60",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          onMouseEnter={() => onStatusHover(index)}
          onClick={() => {
            if (option.disabled) return;
            onStatusClick(option.status);
          }}
        >
          <span>{STATUS_LABEL[option.status]}</span>
          {storyStatus === option.status && <span className="text-[10px] text-muted-foreground">Current</span>}
        </button>
      ))}
    </div>
  );
}
