import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMockPlanningSettingsViewModel } from "@/lib/planning/settings";
import { SettingsAuditCard } from "./settings-audit-card";
import { SettingsLabelTaxonomyCard } from "./settings-label-taxonomy-card";

export const metadata: Metadata = {
  title: "Planning Settings",
};

export default function PlanningSettingsPage() {
  const settings = getMockPlanningSettingsViewModel();

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Planning v1 settings scaffold aligned to planning schema entities.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project defaults</CardTitle>
            <CardDescription>
              Scope from <code>projects</code> with selected project indicator.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border/60 bg-background/40 p-2 text-xs">
              Selected project scope:{" "}
              <span className="font-semibold">
                {settings.project_defaults.selected_project?.key ?? "N/A"}
              </span>
            </div>
            <div className="space-y-2">
              {settings.project_defaults.projects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-md border border-border/60 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {project.key} - {project.name}
                      </p>
                      <p className="text-muted-foreground">{project.repo_root ?? "No repo_root"}</p>
                    </div>
                    <Badge variant={project.status === "ACTIVE" ? "default" : "outline"}>
                      {project.status}
                    </Badge>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      disabled
                      checked={project.is_default === 1}
                      readOnly
                    />
                    is_default
                  </label>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="justify-between border-t">
            <Badge variant="outline">Coming soon</Badge>
            <Button disabled size="sm" variant="outline">
              Save project defaults
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backlog policy</CardTitle>
            <CardDescription>
              Backlog defaults and sprint policy preview from <code>backlogs</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="rounded-md border border-border/60 p-3">
              <p className="font-semibold">Default backlog</p>
              <p className="text-muted-foreground">
                {settings.backlog_policy.default_backlog?.name ?? "No default backlog"}
              </p>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <p className="font-semibold mb-2">Backlog kinds</p>
              <div className="flex flex-wrap gap-1.5">
                {settings.backlog_policy.kinds.map((kind) => (
                  <Badge key={kind} variant="outline">
                    {kind}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <p className="font-semibold mb-2">Visibility</p>
              <label className="mb-1 flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  disabled
                  checked={settings.backlog_policy.visibility_options.active}
                  readOnly
                />
                ACTIVE backlogs
              </label>
              <label className="flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  disabled
                  checked={settings.backlog_policy.visibility_options.closed}
                  readOnly
                />
                CLOSED backlogs
              </label>
            </div>

            <div className="rounded-md border border-border/60 p-3">
              <p className="font-semibold mb-1">Sprint lifecycle preview</p>
              <p className="text-muted-foreground">
                {settings.backlog_policy.sprint_lifecycle_policy.start_semantics}
              </p>
              <p className="text-muted-foreground mt-1">
                {settings.backlog_policy.sprint_lifecycle_policy.complete_semantics}
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-between border-t">
            <Badge variant="outline">Coming soon</Badge>
            <Button disabled size="sm" variant="outline">
              Save backlog policy
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Story and Task workflow</CardTitle>
            <CardDescription>
              Shared status sets and blocked behavior cards from workflow v1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="rounded-md border border-border/60 p-3">
              <p className="font-semibold mb-2">Story statuses</p>
              <div className="flex flex-wrap gap-1.5">
                {settings.workflow.story_statuses.map((status) => (
                  <Badge key={`story-${status}`} variant="outline">
                    {status}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <p className="font-semibold mb-2">Task statuses</p>
              <div className="flex flex-wrap gap-1.5">
                {settings.workflow.task_statuses.map((status) => (
                  <Badge key={`task-${status}`} variant="outline">
                    {status}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              {settings.workflow.blocked_behavior_cards.map((card) => (
                <div key={card.title} className="rounded-md border border-border/60 p-3">
                  <p className="font-semibold">{card.title}</p>
                  <p className="text-muted-foreground">{card.summary}</p>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="justify-between border-t">
            <Badge variant="outline">Informational</Badge>
            <Button disabled size="sm" variant="outline">
              Configure transitions
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent assignment defaults</CardTitle>
            <CardDescription>
              Agent catalog and assignment rules from <code>agents</code> and{" "}
              <code>task_assignments</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="space-y-2">
              {settings.assignment_defaults.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-3"
                >
                  <div>
                    <p className="font-semibold">{agent.openclaw_key}</p>
                    <p className="text-muted-foreground">
                      {agent.name} - {agent.role ?? "no role"}
                    </p>
                  </div>
                  <Badge variant={agent.is_active ? "default" : "outline"}>
                    {agent.is_active ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              {settings.assignment_defaults.policy_cards.map((card) => (
                <div key={card.title} className="rounded-md border border-border/60 p-3">
                  <p className="font-semibold">{card.title}</p>
                  <p className="text-muted-foreground">{card.summary}</p>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="justify-between border-t">
            <Badge variant="outline">Coming soon</Badge>
            <Button disabled size="sm" variant="outline">
              Save assignment defaults
            </Button>
          </CardFooter>
        </Card>

        <SettingsLabelTaxonomyCard />

        <SettingsAuditCard auditActivity={settings.audit_activity} />
      </div>
    </section>
  );
}
