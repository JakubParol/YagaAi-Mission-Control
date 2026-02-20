import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Tailwind text color class for the icon, e.g. "text-green-400" */
  iconColor: string;
  /** Tailwind bg class for icon container, e.g. "bg-green-500/10" */
  iconBg: string;
}

export function StatCard({ label, value, icon: Icon, iconColor, iconBg }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
      <div
        aria-hidden="true"
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconBg)}
      >
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function StatCardsRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {children}
    </div>
  );
}
