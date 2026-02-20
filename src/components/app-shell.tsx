'use client';

import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/60 backdrop-blur-xl border-b border-white/5 lg:hidden">
      <div className="flex h-16 items-center justify-between px-4">
        <MobileNav />
        {/* Spacer to balance the layout */}
        <div className="w-8" />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-slate-950">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content — offset for floating sidebar */}
      <div className="relative flex min-h-screen flex-col lg:pl-80">
        {/* Mobile header */}
        <MobileHeader />

        {/* Main content */}
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
