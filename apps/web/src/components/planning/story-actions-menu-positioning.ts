export interface FloatingCoordinates {
  top: number;
  left: number;
}

export interface Size2D {
  width: number;
  height: number;
}

export interface RectLike {
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

export function hasSameCoordinates(
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
