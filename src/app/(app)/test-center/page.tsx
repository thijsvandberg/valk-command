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
      <div className="relative min-h-full">
        <div className="flex min-h-full items-center justify-center py-24">
          <EmptyState
            icon={<FlaskConical size={20} strokeWidth={1.5} className="text-text-tertiary" />}
            title="Test Center coming soon"
            description="Test coverage tracking and quality reports will appear here."
          />
        </div>
      </div>
    </>
  );
}
