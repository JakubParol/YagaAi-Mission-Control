import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";

import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Test1",
};

export default function Test1Page() {
  return (
    <PageShell
      icon={FlaskConical}
      title="Tests"
      subtitle="Test1"
    />
  );
}
