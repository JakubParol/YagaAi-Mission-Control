import type { LucideIcon } from "lucide-react";

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
    <div className="flex items-center gap-4 rounded-xl border border-[#1f2937] bg-[#0b1220] p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-[#e2e8f0]">{value}</p>
        <p className="text-xs font-medium text-[#94a3b8] truncate">{label}</p>
      </div>
    </div>
  );
}

interface StatCardsRowProps {
  children: React.ReactNode;
}

export function StatCardsRow({ children }: StatCardsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-8">
      {children}
    </div>
  );
}
