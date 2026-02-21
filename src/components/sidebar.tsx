'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Activity, BookOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "./connection-status";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPaths?: string[];
}

const navItems: NavItem[] = [
  { href: "/board", label: "Board", icon: LayoutDashboard },
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/", label: "Stories", icon: BookOpen, matchPaths: ["/stories"] },
];

function isActiveRoute(pathname: string, item: NavItem): boolean {
  if (item.href === "/") {
    return pathname === "/" || pathname.startsWith("/stories");
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Main sidebar"
      className={cn(
        "fixed inset-y-4 left-4 z-50 hidden w-64 lg:flex",
        "flex-col gap-6",
        "bg-slate-900/95 backdrop-blur-xl",
        "border border-white/[0.08]",
        "rounded-xl",
        "p-6",
        "shadow-xl shadow-black/40"
      )}
    >
      {/* Logo */}
      <Link
        href="/"
        className="focus-ring group flex items-center gap-2.5 rounded-lg"
      >
        <div
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(236,133,34,0.4)] transition-shadow duration-300 group-hover:shadow-[0_0_12px_rgba(236,133,34,0.6)]"
        />
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
          Mission Control
        </span>
      </Link>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const active = isActiveRoute(pathname, item);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5",
                "text-sm font-medium",
                "transition-colors duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Connection Status */}
      <div className="border-t border-white/5 pt-4">
        <ConnectionStatus />
      </div>
    </aside>
  );
}
