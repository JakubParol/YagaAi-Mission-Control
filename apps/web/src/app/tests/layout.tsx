import { ModuleTopBar } from "@/components/module-top-bar";
import { PageContent } from "@/components/page-content";
import { navModules } from "@/lib/navigation";

const testsModule = navModules.find((module) => module.href === "/tests");

export default function TestsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {testsModule?.subPages && <ModuleTopBar subPages={testsModule.subPages} />}
      <PageContent>{children}</PageContent>
    </>
  );
}
