import { BookOpen, CheckSquare, Clock, GitPullRequest } from "lucide-react";

import { StatCard, StatCardsRow } from "@/components/stat-card";

import type { SummaryStats } from "./dashboard-types";

interface SummaryStatsBarProps {
  stats: SummaryStats;
}

export function SummaryStatsBar({ stats }: SummaryStatsBarProps) {
  return (
    <StatCardsRow>
      <StatCard
        label="In Progress / Queued / Blocked"
        value={`${stats.storiesInProgress} / ${stats.storiesQueued} / ${stats.storiesBlocked}`}
        icon={BookOpen}
        iconColor="text-blue-400"
        iconBg="bg-blue-500/10"
      />
      <StatCard
        label="Stories Done Today"
        value={stats.storiesDoneToday}
        icon={CheckSquare}
        iconColor="text-emerald-400"
        iconBg="bg-emerald-500/10"
      />
      <StatCard
        label="Tasks Completed Today"
        value={stats.tasksCompletedToday}
        icon={CheckSquare}
        iconColor="text-green-400"
        iconBg="bg-green-500/10"
      />
      <StatCard
        label="PRs Open / Awaiting Review"
        value={`${stats.prsOpen} / ${stats.prsAwaitingReview}`}
        icon={GitPullRequest}
        iconColor="text-purple-400"
        iconBg="bg-purple-500/10"
      />
      <StatCard
        label="Avg Task Completion"
        value={`${stats.avgTaskCompletionMinutes}m`}
        icon={Clock}
        iconColor="text-amber-400"
        iconBg="bg-amber-500/10"
      />
    </StatCardsRow>
  );
}
