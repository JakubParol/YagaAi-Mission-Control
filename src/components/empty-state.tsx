import type React from "react";
import { BookOpen, LayoutDashboard, ListTodo, Inbox } from "lucide-react";

const ICON_MAP = {
  stories: BookOpen,
  board: LayoutDashboard,
  tasks: ListTodo,
  default: Inbox,
} as const;

type IconKey = keyof typeof ICON_MAP;

interface EmptyStateProps {
  icon: IconKey | (string & {});
  title: string;
  description: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  const Icon = ICON_MAP[icon as IconKey] ?? ICON_MAP.default;

  return (
    <div
      role="status"
      className="rounded-lg border border-border bg-card/50 px-6 py-16 text-center"
    >
      <div aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
      <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
