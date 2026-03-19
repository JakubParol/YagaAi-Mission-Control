"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { PageShell } from "@/components/page-shell";

interface PlanningPageShellProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  context?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PlanningPageShell(props: PlanningPageShellProps) {
  return <PageShell accent="primary" {...props} />;
}
