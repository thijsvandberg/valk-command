"use client";

import { usePageTitle } from "@/hooks/usePageTitle";
import { Layers } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export default function RefinementPage() {
  const pageTitle = usePageTitle("Refinement");
  return (
    <>
      {pageTitle}
      <ViewHeader icon={<Layers size={16} strokeWidth={1.5} />}>
        <ViewHeaderTitle>Refinement</ViewHeaderTitle>
      </ViewHeader>
      <div className="relative min-h-full">
        <div className="flex min-h-full items-center justify-center py-24">
          <EmptyState
            icon={<Layers size={20} strokeWidth={1.5} className="text-text-tertiary" />}
            title="Refinement coming soon"
            description="Backlog refinement workflows and story scoring will appear here."
          />
        </div>
      </div>
    </>
  );
}
