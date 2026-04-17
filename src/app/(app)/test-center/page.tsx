"use client";

import { usePageTitle } from "@/hooks/usePageTitle";
import { FlaskConical } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export default function TestCenterPage() {
  const pageTitle = usePageTitle("Test Center");
  return (
    <>
      {pageTitle}
      <ViewHeader icon={<FlaskConical size={16} strokeWidth={1.5} />}>
        <ViewHeaderTitle>Test Center</ViewHeaderTitle>
      </ViewHeader>
      <div className="noise-overlay relative min-h-full">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-[-20%] left-[15%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-30" />
          <div className="absolute bottom-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-50" />
        </div>
        <div className="relative flex min-h-full items-center justify-center py-24">
          <EmptyState
            icon={<FlaskConical size={20} strokeWidth={1.5} className="text-white/30" />}
            title="Test Center coming soon"
            description="Test coverage tracking and quality reports will appear here."
          />
        </div>
      </div>
    </>
  );
}
