import { Suspense } from "react";

import { ModuleTopBar } from "@/components/module-top-bar";
import { PageContent } from "@/components/page-content";
import { LabelFilter } from "@/components/planning/label-filter";
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
          leftSlot={
            <Suspense>
              <div className="flex items-center gap-1">
                <ProjectSelector />
                <LabelFilter />
              </div>
            </Suspense>
          }
        />
      )}
      <PageContent>{children}</PageContent>
    </PlanningFilterProvider>
  );
}
