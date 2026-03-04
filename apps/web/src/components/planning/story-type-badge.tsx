import { BookOpen, Bug, CheckCircle2, FlaskConical, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StoryTypeVisualConfig {
  icon: LucideIcon;
  label: string;
  color: string;
  badgeTone: string;
}

export const STORY_TYPE_CONFIG: Record<string, StoryTypeVisualConfig> = {
  BUG: {
    icon: Bug,
    label: "Bug",
    color: "text-red-400",
    badgeTone: "border-red-500/35 bg-red-500/10 text-red-300",
  },
  TASK: {
    icon: CheckCircle2,
    label: "Task",
    color: "text-blue-300",
    badgeTone: "border-blue-500/35 bg-blue-500/10 text-blue-300",
  },
  SPIKE: {
    icon: FlaskConical,
    label: "Spike",
    color: "text-cyan-400",
    badgeTone: "border-cyan-500/35 bg-cyan-500/10 text-cyan-300",
  },
  CHORE: {
    icon: Wrench,
    label: "Chore",
    color: "text-slate-400",
    badgeTone: "border-slate-500/35 bg-slate-500/10 text-slate-300",
  },
  USER_STORY: {
    icon: BookOpen,
    label: "User Story",
    color: "text-amber-300",
    badgeTone: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  },
};

export function resolveStoryTypeVisualConfig(storyType: string): StoryTypeVisualConfig {
  return STORY_TYPE_CONFIG[storyType] ?? STORY_TYPE_CONFIG.USER_STORY;
}

export function StoryTypeBadge({
  storyType,
  variant = "plain",
  className,
}: {
  storyType: string;
  variant?: "plain" | "badge";
  className?: string;
}) {
  const typeConfig = resolveStoryTypeVisualConfig(storyType);
  const TypeIcon = typeConfig.icon;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1",
        variant === "plain"
          ? cn("text-[11px]", typeConfig.color)
          : cn(
              "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              typeConfig.badgeTone,
            ),
        className,
      )}
    >
      <TypeIcon className={variant === "plain" ? "size-3" : "size-3.5"} />
      <span className="truncate">{typeConfig.label}</span>
    </span>
  );
}
