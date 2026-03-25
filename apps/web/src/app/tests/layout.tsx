import type { ReactNode } from "react";

import { ModuleTopBar } from "@/components/module-top-bar";
import { PageContent } from "@/components/page-content";
import { navModules } from "@/lib/navigation";

interface TestsLayoutProps {
  children: ReactNode;
}

const testsModule = navModules.find((m) => m.href === "/tests");

export default function TestsLayout({ children }: TestsLayoutProps) {
  return (
    <>
      {testsModule?.subPages && (
        <ModuleTopBar subPages={testsModule.subPages} />
      )}
      <PageContent>{children}</PageContent>
    </>
  );
}
