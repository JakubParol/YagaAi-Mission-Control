import { useEffect, useRef, useState, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function isElementTruncated(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

function useOverflowTitle<T extends HTMLElement>(fullText: string): {
  ref: RefObject<T | null>;
  title: string | undefined;
} {
  const ref = useRef<T>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      setIsTruncated(isElementTruncated(element));
    };

    update();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fullText]);

  return {
    ref,
    title: isTruncated ? fullText : undefined,
  };
}

export function StoryEpicDisplay({
  epicKey,
  epicTitle,
  emptyLabel = null,
  className,
}: {
  epicKey?: string | null;
  epicTitle?: string | null;
  emptyLabel?: string | null;
  className?: string;
}) {
  const key = epicKey?.trim() ?? "";
  const title = epicTitle?.trim() ?? "";
  const fullText = key.length > 0 && title.length > 0 ? `${key} ${title}` : "";
  const { ref, title: tooltipTitle } = useOverflowTitle<HTMLSpanElement>(fullText);

  if (key.length === 0 || title.length === 0) {
    return emptyLabel === null ? null : (
      <span className={cn("text-[11px] text-muted-foreground", className)}>{emptyLabel}</span>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "max-w-full justify-start gap-1.5 px-2 py-0.5 text-[10px] font-medium",
        "bg-violet-500/10 text-violet-300 border-violet-500/30",
        className,
      )}
    >
      <span className="shrink-0 font-mono">{key}</span>
      <span ref={ref} className="min-w-0 truncate" title={tooltipTitle}>
        {title}
      </span>
    </Badge>
  );
}
