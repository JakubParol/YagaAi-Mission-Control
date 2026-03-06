"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ChevronRight,
  Flag,
  Link2,
  ListMinus,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Tag,
  Trash2,
  Copy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ItemStatus } from "@/lib/planning/types";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "./story-card";

export const STORY_ACTIONS_SUPPORTED_TYPES = ["USER_STORY", "TASK", "BUG"] as const;
export const STORY_STATUS_ORDER: readonly ItemStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "CODE_REVIEW",
  "VERIFY",
  "DONE",
] as const;

export function isStoryActionsSupportedType(storyType: string | null | undefined): boolean {
  if (!storyType) return false;
  const normalized = storyType.trim().toUpperCase();
  return STORY_ACTIONS_SUPPORTED_TYPES.includes(
    normalized as (typeof STORY_ACTIONS_SUPPORTED_TYPES)[number],
  );
}

export type DeleteConfirmPhase = "closed" | "open" | "submitting";
export type DeleteConfirmEvent = "OPEN" | "CANCEL" | "CONFIRM" | "FINISH";

export function reduceDeleteConfirmPhase(
  phase: DeleteConfirmPhase,
  event: DeleteConfirmEvent,
): DeleteConfirmPhase {
  if (event === "OPEN") return phase === "closed" ? "open" : phase;
  if (event === "CANCEL") return phase === "submitting" ? phase : "closed";
  if (event === "CONFIRM") return phase === "open" ? "submitting" : phase;
  if (event === "FINISH") return "closed";
  return phase;
}

interface StoryActionsMenuProps {
  storyId: string;
  storyType: string | null | undefined;
  storyKey: string | null;
  storyTitle: string;
  storyStatus?: ItemStatus;
  onDelete: (storyId: string) => void | Promise<void>;
  onStatusChange?: (storyId: string, status: ItemStatus) => void | Promise<void>;
  onAddLabel?: (storyId: string) => void;
  sprintMembershipAction?: {
    mode: "add" | "remove";
    onSelect: (storyId: string) => void | Promise<void>;
    disabled?: boolean;
  };
  disabled?: boolean;
  isDeleting?: boolean;
  defaultOpen?: boolean;
  defaultConfirmOpen?: boolean;
  defaultStatusSubmenuOpen?: boolean;
}

type ActiveZone = "main" | "status";

type MainAction =
  | "copy-link"
  | "copy-key"
  | "add-label"
  | "toggle-sprint-membership"
  | "change-status"
  | "add-flag"
  | "link-work-item"
  | "link-parent"
  | "archive"
  | "delete";

interface MenuActionItem {
  id: MainAction;
  label: string;
  tone?: "default" | "danger";
  disabled: boolean;
  submenu?: boolean;
  icon: ComponentType<{ className?: string }>;
}

const SECTION_GROUPS: ReadonlyArray<ReadonlyArray<MainAction>> = [
  ["copy-link", "copy-key", "add-label", "toggle-sprint-membership"],
  ["change-status"],
  ["add-flag", "link-work-item", "link-parent", "archive"],
  ["delete"],
] as const;

interface FloatingCoordinates {
  top: number;
  left: number;
}

interface Size2D {
  width: number;
  height: number;
}

interface RectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

const FLOATING_OFFSET_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hasSameCoordinates(
  current: FloatingCoordinates | null,
  next: FloatingCoordinates,
): boolean {
  if (!current) return false;
  return current.left === next.left && current.top === next.top;
}

export function calculateMainMenuCoordinates(
  triggerRect: RectLike,
  menuSize: Size2D,
  viewportSize: Size2D,
): FloatingCoordinates {
  const minLeft = VIEWPORT_MARGIN_PX;
  const maxLeft = Math.max(VIEWPORT_MARGIN_PX, viewportSize.width - menuSize.width - VIEWPORT_MARGIN_PX);
  const preferredLeft = triggerRect.right - menuSize.width;
  const left = clamp(preferredLeft, minLeft, maxLeft);

  const preferredTop = triggerRect.bottom + FLOATING_OFFSET_PX;
  const needsFlipUp = preferredTop + menuSize.height > viewportSize.height - VIEWPORT_MARGIN_PX;
  const flippedTop = triggerRect.top - menuSize.height - FLOATING_OFFSET_PX;
  const top = clamp(
    needsFlipUp ? flippedTop : preferredTop,
    VIEWPORT_MARGIN_PX,
    Math.max(VIEWPORT_MARGIN_PX, viewportSize.height - menuSize.height - VIEWPORT_MARGIN_PX),
  );

  return { top, left };
}

export function calculateSubmenuCoordinates(
  anchorRect: RectLike,
  parentMenuRect: RectLike,
  submenuSize: Size2D,
  viewportSize: Size2D,
): FloatingCoordinates {
  const rightPlacement = parentMenuRect.right + FLOATING_OFFSET_PX;
  const rightFits = rightPlacement + submenuSize.width <= viewportSize.width - VIEWPORT_MARGIN_PX;
  const leftPlacement = parentMenuRect.left - submenuSize.width - FLOATING_OFFSET_PX;
  const left = rightFits
    ? rightPlacement
    : clamp(
        leftPlacement,
        VIEWPORT_MARGIN_PX,
        Math.max(VIEWPORT_MARGIN_PX, viewportSize.width - submenuSize.width - VIEWPORT_MARGIN_PX),
      );

  const top = clamp(
    anchorRect.top,
    VIEWPORT_MARGIN_PX,
    Math.max(VIEWPORT_MARGIN_PX, viewportSize.height - submenuSize.height - VIEWPORT_MARGIN_PX),
  );

  return { top, left };
}

function getStoryLinkUrl(storyId: string): string {
  if (typeof window === "undefined") return `/planning/stories/${storyId}`;
  return new URL(`/planning/stories/${storyId}`, window.location.origin).toString();
}

async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") return;
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export function StoryActionsMenu({
  storyId,
  storyType,
  storyKey,
  storyTitle,
  storyStatus,
  onDelete,
  onStatusChange,
  onAddLabel,
  sprintMembershipAction,
  disabled = false,
  isDeleting = false,
  defaultOpen = false,
  defaultConfirmOpen = false,
  defaultStatusSubmenuOpen = false,
}: StoryActionsMenuProps) {
  const isSupportedType = isStoryActionsSupportedType(storyType);
  const [isClient, setIsClient] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [statusSubmenuOpen, setStatusSubmenuOpen] = useState(defaultStatusSubmenuOpen);
  const [activeZone, setActiveZone] = useState<ActiveZone>("main");
  const [activeMainIndex, setActiveMainIndex] = useState(0);
  const [activeStatusIndex, setActiveStatusIndex] = useState(0);
  const [menuCoordinates, setMenuCoordinates] = useState<FloatingCoordinates | null>(null);
  const [submenuCoordinates, setSubmenuCoordinates] = useState<FloatingCoordinates | null>(null);
  const [confirmPhase, setConfirmPhase] = useState<DeleteConfirmPhase>(
    defaultConfirmOpen ? "open" : "closed",
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const mainActionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const statusActionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isDisabled = disabled || isDeleting;
  const isConfirmOpen = confirmPhase !== "closed";
  const isConfirming = confirmPhase === "submitting";
  const storyLabel = storyKey ? `${storyKey} ${storyTitle}` : storyTitle;

  const mainActions = useMemo<MenuActionItem[]>(
    () => [
      { id: "copy-link", label: "Copy link", icon: Copy, disabled: isDisabled },
      { id: "copy-key", label: "Copy key", icon: Copy, disabled: isDisabled || !storyKey },
      { id: "add-label", label: "Add label", icon: Tag, disabled: isDisabled },
      ...(sprintMembershipAction
        ? [
            {
              id: "toggle-sprint-membership" as const,
              label:
                sprintMembershipAction.mode === "add"
                  ? "Add to active sprint"
                  : "Remove from active sprint",
              icon: sprintMembershipAction.mode === "add" ? ListPlus : ListMinus,
              disabled: isDisabled || Boolean(sprintMembershipAction.disabled),
            },
          ]
        : []),
      {
        id: "change-status",
        label: "Change status",
        icon: ChevronRight,
        disabled: isDisabled || !onStatusChange,
        submenu: true,
      },
      { id: "add-flag", label: "Add flag", icon: Flag, disabled: true },
      { id: "link-work-item", label: "Link work item", icon: Link2, disabled: true },
      { id: "link-parent", label: "Link parent", icon: Link2, disabled: true },
      { id: "archive", label: "Archive", icon: Archive, disabled: true },
      { id: "delete", label: "Delete", icon: Trash2, disabled: isDisabled, tone: "danger" },
    ],
    [isDisabled, onStatusChange, sprintMembershipAction, storyKey],
  );

  const enabledMainIndexes = useMemo(
    () => mainActions.flatMap((item, index) => (item.disabled ? [] : [index])),
    [mainActions],
  );
  const statusOptions = useMemo(
    () =>
      STORY_STATUS_ORDER.map((status) => ({
        status,
        disabled: isDisabled || !onStatusChange || storyStatus === status,
      })),
    [isDisabled, onStatusChange, storyStatus],
  );
  const enabledStatusIndexes = useMemo(
    () => statusOptions.flatMap((item, index) => (item.disabled ? [] : [index])),
    [statusOptions],
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  const updateFloatingPositions = useCallback(() => {
    if (typeof window === "undefined" || !open || !rootRef.current) return;

    if (!menuRef.current) {
      setMenuCoordinates(null);
      setSubmenuCoordinates(null);
      return;
    }

    const viewportSize = { width: window.innerWidth, height: window.innerHeight };
    const triggerRect = rootRef.current.getBoundingClientRect();
    const nextMenuCoordinates = calculateMainMenuCoordinates(
      triggerRect,
      {
        width: menuRef.current.offsetWidth,
        height: menuRef.current.offsetHeight,
      },
      viewportSize,
    );
    setMenuCoordinates((current) =>
      hasSameCoordinates(current, nextMenuCoordinates) ? current : nextMenuCoordinates,
    );

    if (!statusSubmenuOpen || !menuRef.current) {
      setSubmenuCoordinates(null);
      return;
    }

    if (!submenuRef.current) {
      // Keep submenu hidden until real dimensions are measurable.
      setSubmenuCoordinates(null);
      return;
    }

    const changeStatusIndex = mainActions.findIndex((item) => item.id === "change-status");
    const anchorRect =
      mainActionRefs.current[changeStatusIndex]?.getBoundingClientRect() ??
      menuRef.current.getBoundingClientRect();
    const parentMenuRect = menuRef.current.getBoundingClientRect();
    const nextSubmenuCoordinates = calculateSubmenuCoordinates(
      anchorRect,
      parentMenuRect,
      {
        width: submenuRef.current.offsetWidth,
        height: submenuRef.current.offsetHeight,
      },
      viewportSize,
    );
    setSubmenuCoordinates((current) =>
      hasSameCoordinates(current, nextSubmenuCoordinates) ? current : nextSubmenuCoordinates,
    );
  },
    [mainActions, open, statusSubmenuOpen],
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const clickInsideTrigger = rootRef.current?.contains(target) ?? false;
      const clickInsideMenu = menuRef.current?.contains(target) ?? false;
      const clickInsideSubmenu = submenuRef.current?.contains(target) ?? false;
      if (!clickInsideTrigger && !clickInsideMenu && !clickInsideSubmenu) {
        setOpen(false);
        setStatusSubmenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (statusSubmenuOpen) {
        setStatusSubmenuOpen(false);
        setActiveZone("main");
        return;
      }
      setOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, statusSubmenuOpen]);

  useEffect(() => {
    if (!open) return;
    const nextMainIndex = enabledMainIndexes[0] ?? 0;
    setActiveMainIndex(nextMainIndex);
    setStatusSubmenuOpen(false);
    setActiveZone("main");
    queueMicrotask(() => {
      mainActionRefs.current[nextMainIndex]?.focus();
    });
  }, [enabledMainIndexes, open]);

  useLayoutEffect(() => {
    if (!open) return;

    updateFloatingPositions();
    const handleViewportChange = () => {
      updateFloatingPositions();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updateFloatingPositions]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuCoordinates(null);
      setSubmenuCoordinates(null);
      return;
    }
    updateFloatingPositions();
  }, [open, statusSubmenuOpen, activeMainIndex, activeStatusIndex, updateFloatingPositions]);

  const focusMainAction = (index: number) => {
    setActiveMainIndex(index);
    setActiveZone("main");
    queueMicrotask(() => {
      mainActionRefs.current[index]?.focus();
    });
  };

  const focusStatusAction = (index: number) => {
    setActiveStatusIndex(index);
    setActiveZone("status");
    queueMicrotask(() => {
      statusActionRefs.current[index]?.focus();
    });
  };

  const openStatusSubmenu = () => {
    if (!onStatusChange || enabledStatusIndexes.length === 0) return;
    setStatusSubmenuOpen(true);
    const nextIndex = enabledStatusIndexes[0] ?? 0;
    focusStatusAction(nextIndex);
  };

  const handleDeleteMenuItem = () => {
    if (isDisabled) return;
    setOpen(false);
    setStatusSubmenuOpen(false);
    setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "OPEN"));
  };

  const handleConfirmDelete = async () => {
    if (isDisabled || isConfirming) return;
    setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "CONFIRM"));
    try {
      await onDelete(storyId);
    } finally {
      setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "FINISH"));
    }
  };

  const handleMainAction = async (actionId: MainAction) => {
    if (actionId === "change-status") {
      openStatusSubmenu();
      return;
    }

    if (actionId === "delete") {
      handleDeleteMenuItem();
      return;
    }

    if (actionId === "toggle-sprint-membership") {
      if (!sprintMembershipAction || isDisabled) return;
      await sprintMembershipAction.onSelect(storyId);
      setOpen(false);
      setStatusSubmenuOpen(false);
      return;
    }

    if (actionId === "copy-link") {
      await writeClipboard(getStoryLinkUrl(storyId));
      setOpen(false);
      setStatusSubmenuOpen(false);
      return;
    }

    if (actionId === "copy-key") {
      if (storyKey) {
        await writeClipboard(storyKey);
      }
      setOpen(false);
      setStatusSubmenuOpen(false);
      return;
    }

    if (actionId === "add-label") {
      onAddLabel?.(storyId);
      setOpen(false);
      setStatusSubmenuOpen(false);
    }
  };

  const handleStatusAction = async (status: ItemStatus) => {
    if (!onStatusChange || status === storyStatus || isDisabled) return;
    await onStatusChange(storyId, status);
    setOpen(false);
    setStatusSubmenuOpen(false);
  };

  const moveFocusInMain = (direction: 1 | -1) => {
    if (enabledMainIndexes.length === 0) return;
    const currentEnabledIndex = enabledMainIndexes.indexOf(activeMainIndex);
    const startIndex = currentEnabledIndex === -1 ? 0 : currentEnabledIndex;
    const nextEnabledIndex =
      (startIndex + direction + enabledMainIndexes.length) % enabledMainIndexes.length;
    focusMainAction(enabledMainIndexes[nextEnabledIndex]!);
  };

  const moveFocusInStatus = (direction: 1 | -1) => {
    if (enabledStatusIndexes.length === 0) return;
    const currentEnabledIndex = enabledStatusIndexes.indexOf(activeStatusIndex);
    const startIndex = currentEnabledIndex === -1 ? 0 : currentEnabledIndex;
    const nextEnabledIndex =
      (startIndex + direction + enabledStatusIndexes.length) % enabledStatusIndexes.length;
    focusStatusAction(enabledStatusIndexes[nextEnabledIndex]!);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open) return;

    if (event.key === "Tab") {
      setOpen(false);
      setStatusSubmenuOpen(false);
      return;
    }

    if (activeZone === "main") {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocusInMain(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocusInMain(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        const action = mainActions[activeMainIndex];
        if (action?.id === "change-status") {
          event.preventDefault();
          openStatusSubmenu();
        }
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        const action = mainActions[activeMainIndex];
        if (!action || action.disabled) return;
        event.preventDefault();
        void handleMainAction(action.id);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocusInStatus(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocusInStatus(-1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setStatusSubmenuOpen(false);
      setActiveZone("main");
      queueMicrotask(() => {
        mainActionRefs.current[activeMainIndex]?.focus();
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const option = statusOptions[activeStatusIndex];
      if (!option || option.disabled) return;
      event.preventDefault();
      void handleStatusAction(option.status);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setStatusSubmenuOpen(false);
      setActiveZone("main");
      queueMicrotask(() => {
        mainActionRefs.current[activeMainIndex]?.focus();
      });
    }
  };

  if (!isSupportedType) return null;

  const menuStyle: CSSProperties = {
    position: "fixed",
    top: menuCoordinates?.top ?? 0,
    left: menuCoordinates?.left ?? 0,
    visibility: menuCoordinates ? "visible" : "hidden",
  };

  const submenuStyle: CSSProperties = {
    position: "fixed",
    top: submenuCoordinates?.top ?? 0,
    left: submenuCoordinates?.left ?? 0,
    visibility: submenuCoordinates ? "visible" : "hidden",
  };

  const menuContent = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Story actions for ${storyLabel}`}
      onKeyDown={handleMenuKeyDown}
      style={menuStyle}
      className="z-30 min-w-48 rounded-md border border-border/70 bg-card p-1 shadow-xl"
    >
      {SECTION_GROUPS.map((group, groupIndex) => (
        <div key={`group-${groupIndex}`} className={cn(groupIndex > 0 && "mt-1 border-t border-border/40 pt-1") }>
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
                onMouseEnter={() => {
                  setActiveMainIndex(actionIndex);
                  setActiveZone("main");
                }}
                onClick={() => {
                  if (action.disabled) return;
                  void handleMainAction(action.id);
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
  ) : null;

  const submenuContent = open && statusSubmenuOpen ? (
    <div
      ref={submenuRef}
      role="menu"
      aria-label="Story status options"
      onKeyDown={handleMenuKeyDown}
      style={submenuStyle}
      className="z-40 min-w-44 rounded-md border border-border/70 bg-card p-1 shadow-xl"
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
          onMouseEnter={() => {
            setActiveStatusIndex(index);
            setActiveZone("status");
          }}
          onClick={() => {
            if (option.disabled) return;
            void handleStatusAction(option.status);
          }}
        >
          <span>{STATUS_LABEL[option.status]}</span>
          {storyStatus === option.status && <span className="text-[10px] text-muted-foreground">Current</span>}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={isDisabled}
        aria-label={`Open story actions for ${storyLabel}`}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((prev) => !prev)}
      >
        {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
      </Button>

      {menuContent &&
        (isClient ? createPortal(menuContent, document.body) : menuContent)}
      {submenuContent &&
        (isClient ? createPortal(submenuContent, document.body) : submenuContent)}

      <Dialog
        open={isConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "OPEN"));
            return;
          }
          setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "CANCEL"));
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!isConfirming}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Delete story?</DialogTitle>
            <DialogDescription>
              You are about to delete <span className="font-medium text-foreground">{storyLabel}</span>.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmPhase((prev) => reduceDeleteConfirmPhase(prev, "CANCEL"))}
              disabled={isConfirming}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleConfirmDelete();
              }}
              disabled={isConfirming}
            >
              {isConfirming && <Loader2 className="size-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
