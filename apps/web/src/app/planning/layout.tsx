import { ModuleTopBar } from "@/components/module-top-bar";
import { PageContent } from "@/components/page-content";
import { navModules } from "@/lib/navigation";

const planningModule = navModules.find((m) => m.href === "/planning");

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {planningModule?.subPages && (
        <ModuleTopBar subPages={planningModule.subPages} />
      )}
      <PageContent>{children}</PageContent>
    </>
  );
}
