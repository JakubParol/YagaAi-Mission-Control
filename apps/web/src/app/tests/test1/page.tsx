"use client";

import { FlaskConical } from "lucide-react";

import { PageShell } from "@/components/page-shell";

export default function Test1Page() {
  return (
    <PageShell
      icon={FlaskConical}
      title="Test 1"
      subtitle="Test environment and diagnostic views"
    />
  );
}
