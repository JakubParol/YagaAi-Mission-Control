'use client';

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, BookOpen } from "lucide-react";
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

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = () => setIsOpen(false);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-slate-800 transition-all duration-200 lg:hidden"
        aria-label="Open menu"
        aria-expanded={isOpen}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Portal drawer */}
      {isOpen && mounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/60 lg:hidden"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <nav
            className={[
              "fixed top-4 bottom-4 left-4 z-[9999] w-72 lg:hidden",
              "bg-[#0b1220]",
              "border border-white/10",
              "shadow-2xl",
              "rounded-xl",
              "flex flex-col p-6 gap-6",
              "overflow-hidden",
            ].join(" ")}
            role="navigation"
            aria-label="Mobile navigation"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <Link href="/" onClick={handleClose} className="flex items-center gap-2.5 group">
                <div className="h-2.5 w-2.5 rounded-full bg-[#ec8522] shadow-[0_0_8px_rgba(236,133,34,0.4)] group-hover:shadow-[0_0_12px_rgba(236,133,34,0.6)] transition-shadow duration-300" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e2e8f0]">
                  Mission Control
                </span>
              </Link>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-slate-800 transition-all duration-200"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Nav links */}
            <div className="flex-1 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const active = isActiveRoute(pathname, item);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleClose}
                    className={[
                      "flex items-center gap-3 px-3 py-2.5",
                      "text-sm font-semibold",
                      "rounded-lg",
                      "transition-all duration-200",
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
            </div>

            {/* Connection Status */}
            <div className="shrink-0 border-t border-white/5 pt-4">
              <ConnectionStatus />
            </div>
          </nav>
        </>,
        document.body
      )}
    </>
  );
}
