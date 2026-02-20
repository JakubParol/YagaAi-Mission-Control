'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ConnectionStatus } from "./connection-status";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPaths?: string[];
}

const navItems: NavItem[] = [
  { href: "/board", label: "Board", icon: LayoutDashboard },
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
      className={[
        // Positioning — floating with margin
        "fixed inset-y-4 left-4 z-50 hidden w-64 lg:flex",
        // Flexbox
        "flex-col gap-6",
        // Glass morphism
        "bg-slate-900 backdrop-blur-xl",
        "border border-white/10",
        "rounded-xl",
        "p-6",
        // Shadow
        "shadow-xl shadow-black/40",
      ].join(" ")}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="h-2.5 w-2.5 rounded-full bg-[#ec8522] shadow-[0_0_8px_rgba(236,133,34,0.4)] group-hover:shadow-[0_0_12px_rgba(236,133,34,0.6)] transition-shadow duration-300" />
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e2e8f0]">
          Mission Control
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1" role="navigation" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = isActiveRoute(pathname, item);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                // Base
                "flex items-center gap-3 px-3 py-2.5",
                "text-sm font-semibold",
                "rounded-lg",
                "transition-all duration-200",
                // Active / Inactive
                active
                  ? "bg-[#ec8522]/10 text-[#ec8522] shadow-sm"
                  : "text-[#94a3b8] hover:bg-slate-800 hover:text-[#e2e8f0]",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
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
