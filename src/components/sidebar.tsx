'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { ConnectionStatus } from "./connection-status";

const navItems = [
  { href: "/board", label: "Board", icon: "📊" },
  { href: "/", label: "Stories", icon: "📋" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" || pathname.startsWith("/stories");
    }
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#ec8522]" />
          <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground">
            Mission Control
          </span>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 space-y-1 px-2 py-2">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMobile}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-l-2 border-[#ec8522] bg-sidebar-accent text-[#ec8522]"
                  : "border-l-2 border-transparent text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Connection Status */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <ConnectionStatus />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-md bg-card border border-border text-foreground md:hidden"
        aria-label="Toggle navigation"
      >
        {mobileOpen ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="4" x2="14" y2="14" />
            <line x1="14" y1="4" x2="4" y2="14" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="5" x2="15" y2="5" />
            <line x1="3" y1="9" x2="15" y2="9" />
            <line x1="3" y1="13" x2="15" y2="13" />
          </svg>
        )}
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar — desktop (always visible) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[180px] border-r border-sidebar-border bg-sidebar backdrop-blur-xl md:block">
        {sidebarContent}
      </aside>

      {/* Sidebar — mobile (slide in) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[220px] border-r border-sidebar-border bg-card backdrop-blur-xl transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Add top padding on mobile to avoid overlapping the hamburger */}
        <div className="pt-14">
          {sidebarContent}
        </div>
      </aside>
    </>
  );
}
