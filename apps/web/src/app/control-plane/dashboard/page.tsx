"use client";

import { LayoutDashboard } from "lucide-react";

import { PageShell } from "@/components/page-shell";

import {
  MOCK_ACTIVITY,
  MOCK_AGENTS,
  MOCK_ALERTS,
  MOCK_QUEUES,
  MOCK_STATS,
} from "./dashboard-mock-data";
import { SummaryStatsBar } from "./summary-stats-bar";
import { AgentFleetCards } from "./agent-fleet-cards";
import { ActivityFeed } from "./activity-feed";
import { AgentQueueSection } from "./agent-queue-section";
import { AlertsPanel } from "./alerts-panel";

export default function ControlPlaneDashboardPage() {
  return (
    <>
      <PageShell
        icon={LayoutDashboard}
        title="Agent Dashboard"
        subtitle="Real-time agent fleet monitoring and orchestration overview"
      />

      <div className="space-y-6">
        {/* Section 1: Summary stats */}
        <SummaryStatsBar stats={MOCK_STATS} />

        {/* Section 2: Agent fleet hero cards */}
        <AgentFleetCards agents={MOCK_AGENTS} />

        {/* Sections 3-5: Activity + Queues + Alerts */}
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <ActivityFeed events={MOCK_ACTIVITY} agents={MOCK_AGENTS} />

          <div className="space-y-6">
            <AgentQueueSection queues={MOCK_QUEUES} />
            <AlertsPanel alerts={MOCK_ALERTS} />
          </div>
        </div>
      </div>
    </>
  );
}
