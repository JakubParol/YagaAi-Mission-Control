"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

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

export interface UseFloatingMenuReturn {
  open: boolean;
  toggle: () => void;
  close: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  menuStyle: CSSProperties;
}

export function useFloatingMenu(): UseFloatingMenuReturn {
  const [open, setOpen] = useState(false);
  const [menuCoordinates, setMenuCoordinates] =
    useState<FloatingCoordinates | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateFloatingPosition = useCallback(() => {
    if (
      typeof window === "undefined" ||
      !open ||
      !rootRef.current ||
      !menuRef.current
    ) {
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
      if (
        current.left === nextCoordinates.left &&
        current.top === nextCoordinates.top
      ) {
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

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (!next) setMenuCoordinates(null);
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setMenuCoordinates(null);
  }, []);

  const menuStyle: CSSProperties = {
    position: "fixed",
    top: menuCoordinates?.top ?? 0,
    left: menuCoordinates?.left ?? 0,
    visibility: menuCoordinates ? "visible" : "hidden",
  };

  return { open, toggle, close, rootRef, menuRef, menuStyle };
}
