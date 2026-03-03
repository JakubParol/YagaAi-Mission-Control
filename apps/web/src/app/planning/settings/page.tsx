import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Planning Settings",
};

export default function PlanningSettingsPage() {
  return (
    <section className="space-y-2">
      <h1 className="text-3xl font-bold text-foreground">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Planning settings scaffolding is being prepared.
      </p>
    </section>
  );
}
