"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageShellAccent = "default" | "primary";

interface PageShellProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  accent?: PageShellAccent;
  context?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

const ICON_ACCENT: Record<PageShellAccent, string> = {
  default: "border-border/60 bg-muted/40 text-muted-foreground",
  primary: "border-primary/40 bg-primary/10 text-primary",
};

const SUBTITLE_ACCENT: Record<PageShellAccent, string> = {
  default: "text-muted-foreground",
  primary: "text-primary/80",
};

export function PageShell({
  icon: Icon,
  title,
  subtitle,
  accent = "default",
  context,
  controls,
  actions,
  className,
}: PageShellProps) {
  return (
    <section
      className={cn(
        "mb-4 rounded-2xl border border-border/60 bg-gradient-to-br from-card/95 via-card/85 to-muted/30 p-3 shadow-sm",
        "backdrop-blur supports-[backdrop-filter]:bg-card/80",
        className,
      )}
      aria-label={`${title} top shell`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex size-8 items-center justify-center rounded-xl border", ICON_ACCENT[accent])}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              {subtitle ? (
                <p className={cn("mt-0.5 text-xs", SUBTITLE_ACCENT[accent])}>{subtitle}</p>
              ) : null}
            </div>
          </div>
          {context ? <div className="mt-1.5 text-xs text-muted-foreground">{context}</div> : null}
        </div>

        {actions ? (
          <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {actions}
          </div>
        ) : null}
      </div>

      {controls ? (
        <div className="mt-2.5 border-t border-border/50 pt-2.5">
          {controls}
        </div>
      ) : null}
    </section>
  );
}
