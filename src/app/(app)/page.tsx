"use client";

import { usePageTitle } from "@/hooks/usePageTitle";
import { LayoutDashboard } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";

export default function DashboardPage() {
  const pageTitle = usePageTitle("Dashboard");
  return (
    <>
      {pageTitle}
      <ViewHeader icon={<LayoutDashboard size={16} strokeWidth={1.5} />}>
        <ViewHeaderTitle>Dashboard</ViewHeaderTitle>
      </ViewHeader>
      <div className="noise-overlay relative min-h-full">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-[-20%] left-[15%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-30" />
          <div className="absolute bottom-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-50" />
        </div>
      </div>
    </>
  );
}
