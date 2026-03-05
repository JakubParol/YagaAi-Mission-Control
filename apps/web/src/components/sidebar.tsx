'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "./connection-status";
import { navModules, isModuleActive } from "@/lib/navigation";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Main sidebar"
      className={cn(
        "fixed inset-y-4 left-4 z-50 hidden lg:flex",
        collapsed ? "w-20 gap-4 p-4" : "w-64 gap-6 p-6",
        "flex-col",
        "bg-slate-900/95 backdrop-blur-xl",
        "border border-white/[0.08]",
        "rounded-xl",
        "shadow-xl shadow-black/40"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
        <Link
          href="/"
          className={cn(
            "focus-ring group flex items-center rounded-lg",
            collapsed ? "justify-center p-2" : "gap-2.5"
          )}
          aria-label="Mission Control home"
        >
          <div
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(236,133,34,0.4)] transition-shadow duration-300 group-hover:shadow-[0_0_12px_rgba(236,133,34,0.6)]"
          />
          {!collapsed ? (
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
              Mission Control
            </span>
          ) : null}
        </Link>

        {!collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            aria-pressed={collapsed}
            className={cn(
              "focus-ring flex h-8 w-8 items-center justify-center rounded-lg",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-white/[0.04]",
              "transition-colors duration-150"
            )}
          >
            <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          aria-pressed={collapsed}
          className={cn(
            "focus-ring flex h-8 w-full items-center justify-center rounded-lg",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-white/[0.04]",
            "transition-colors duration-150"
          )}
        >
          <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1">
        {navModules.map((mod) => {
          const active = isModuleActive(pathname, mod);
          const Icon = mod.icon;

          return (
            <div key={mod.href} className={cn("relative", collapsed ? "group/nav-item" : undefined)}>
              <Link
                href={mod.subPages?.[0]?.href ?? mod.href}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? mod.label : undefined}
                className={cn(
                  "focus-ring flex items-center rounded-lg py-2.5",
                  "text-sm font-medium",
                  "transition-colors duration-150",
                  collapsed ? "justify-center px-2" : "gap-3 px-3",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {!collapsed ? mod.label : <span className="sr-only">{mod.label}</span>}
              </Link>
              {collapsed ? (
                <span
                  role="tooltip"
                  className={cn(
                    "pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border/70 bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity duration-150",
                    "group-hover/nav-item:opacity-100 group-focus-within/nav-item:opacity-100"
                  )}
                >
                  {mod.label}
                </span>
              ) : null}
            </div>
          );
        })}
      </nav>

      {/* Connection Status */}
      {!collapsed ? (
        <div className="border-t border-white/5 pt-4">
          <ConnectionStatus />
        </div>
      ) : null}
    </aside>
  );
}
