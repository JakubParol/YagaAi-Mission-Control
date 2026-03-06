"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BacklogBoardActionsMenuProps {
  backlogName: string;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}

interface FloatingCoordinates {
  top: number;
  left: number;
}

interface RectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface Size2D {
  width: number;
  height: number;
}

const FLOATING_OFFSET_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function calculateMenuCoordinates(
  triggerRect: RectLike,
  menuSize: Size2D,
  viewportSize: Size2D,
): FloatingCoordinates {
  const minLeft = VIEWPORT_MARGIN_PX;
  const maxLeft = Math.max(
    VIEWPORT_MARGIN_PX,
    viewportSize.width - menuSize.width - VIEWPORT_MARGIN_PX,
  );
  const preferredLeft = triggerRect.right - menuSize.width;
  const left = clamp(preferredLeft, minLeft, maxLeft);

  const preferredTop = triggerRect.bottom + FLOATING_OFFSET_PX;
  const needsFlipUp =
    preferredTop + menuSize.height > viewportSize.height - VIEWPORT_MARGIN_PX;
  const flippedTop = triggerRect.top - menuSize.height - FLOATING_OFFSET_PX;
  const top = clamp(
    needsFlipUp ? flippedTop : preferredTop,
    VIEWPORT_MARGIN_PX,
    Math.max(
      VIEWPORT_MARGIN_PX,
      viewportSize.height - menuSize.height - VIEWPORT_MARGIN_PX,
    ),
  );

  return { top, left };
}

export function BacklogBoardActionsMenu({
  backlogName,
  canDelete,
  isDeleting,
  onDelete,
}: BacklogBoardActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuCoordinates, setMenuCoordinates] = useState<FloatingCoordinates | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerDisabled = isDeleting || !canDelete;

  const updateFloatingPosition = useCallback(() => {
    if (typeof window === "undefined" || !open || !rootRef.current || !menuRef.current) {
      setMenuCoordinates(null);
      return;
    }

    const nextCoordinates = calculateMenuCoordinates(
      rootRef.current.getBoundingClientRect(),
      {
        width: menuRef.current.offsetWidth,
        height: menuRef.current.offsetHeight,
      },
      { width: window.innerWidth, height: window.innerHeight },
    );

    setMenuCoordinates((current) => {
      if (!current) return nextCoordinates;
      if (current.left === nextCoordinates.left && current.top === nextCoordinates.top) {
        return current;
      }
      return nextCoordinates;
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const clickInsideTrigger = rootRef.current?.contains(target) ?? false;
      const clickInsideMenu = menuRef.current?.contains(target) ?? false;
      if (!clickInsideTrigger && !clickInsideMenu) {
        setOpen(false);
        setMenuCoordinates(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setMenuCoordinates(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const rafId = window.requestAnimationFrame(() => {
      updateFloatingPosition();
    });
    const handleViewportChange = () => {
      updateFloatingPosition();
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updateFloatingPosition]);

  const menuStyle: CSSProperties = {
    position: "fixed",
    top: menuCoordinates?.top ?? 0,
    left: menuCoordinates?.left ?? 0,
    visibility: menuCoordinates ? "visible" : "hidden",
  };

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Board actions for ${backlogName}`}
      style={menuStyle}
      className="z-40 min-w-36 rounded-md border border-border/70 bg-card p-1 shadow-xl"
    >
      <button
        type="button"
        role="menuitem"
        disabled={triggerDisabled}
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
          "text-red-300 hover:bg-red-500/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        onClick={() => {
          if (triggerDisabled) return;
          setOpen(false);
          onDelete();
        }}
      >
        {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        Delete
      </button>
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
        disabled={triggerDisabled}
        title={canDelete ? "Board actions" : "Default board cannot be deleted"}
        aria-label={`Open board actions for ${backlogName}`}
        className="text-muted-foreground hover:text-foreground"
        onClick={() =>
          setOpen((prev) => {
            const next = !prev;
            if (!next) setMenuCoordinates(null);
            return next;
          })
        }
      >
        {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
      </Button>

      {menu && (typeof document !== "undefined" ? createPortal(menu, document.body) : menu)}
    </div>
  );
}
