import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

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
  return (
    <div className="relative min-h-screen bg-background">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content — offset for floating sidebar */}
      <div className="relative flex min-h-screen flex-col lg:pl-72">
        {/* Mobile header */}
        <MobileHeader />

        {/* Page content */}
        {children}
      </div>
    </div>
  );
}
