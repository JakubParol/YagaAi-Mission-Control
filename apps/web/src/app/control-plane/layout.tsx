import { ModuleTopBar } from "@/components/module-top-bar";
import { PageContent } from "@/components/page-content";
import { navModules } from "@/lib/navigation";

const controlPlaneModule = navModules.find((m) => m.href === "/control-plane");

export default function ControlPlaneLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {controlPlaneModule?.subPages && (
        <ModuleTopBar subPages={controlPlaneModule.subPages} />
      )}
      <PageContent>{children}</PageContent>
    </>
  );
}
