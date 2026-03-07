'use client';

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  parseSidebarCollapsedPreference,
  serializeSidebarCollapsedPreference,
} from "@/lib/sidebar-preference";

function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-slate-950/80 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center px-4">
        <MobileNav />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const persisted = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    return parseSidebarCollapsedPreference(persisted);
  });

  function handleSidebarToggle() {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        serializeSidebarCollapsedPreference(next),
      );
      return next;
    });
  }

  return (
    <TooltipProvider>
      <div className="relative min-h-screen bg-background">
        {/* Desktop sidebar */}
        <Sidebar
          collapsed={isSidebarCollapsed}
          onToggleCollapsed={handleSidebarToggle}
        />

        {/* Main content — offset for floating sidebar */}
        <div
          className={
            isSidebarCollapsed
              ? "relative flex min-h-screen flex-col lg:pl-24"
              : "relative flex min-h-screen flex-col lg:pl-72"
          }
        >
          {/* Mobile header */}
          <MobileHeader />

          {/* Page content */}
          {children}
        </div>
      </div>
    </TooltipProvider>
  );
}
