import { ModuleTopBar } from "@/components/module-top-bar";
import { PageContent } from "@/components/page-content";
import { PlanningFilterProvider } from "@/components/planning/planning-filter-context";
import { ProjectSelector } from "@/components/planning/project-selector";
import { navModules } from "@/lib/navigation";

const planningModule = navModules.find((m) => m.href === "/planning");

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlanningFilterProvider>
      {planningModule?.subPages && (
        <ModuleTopBar
          subPages={planningModule.subPages}
          leftSlot={<ProjectSelector />}
        />
      )}
      <PageContent>{children}</PageContent>
    </PlanningFilterProvider>
  );
}
