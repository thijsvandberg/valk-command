"use client";

import { useMemo } from "react";
import { Boxes, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { RefinementHistoryList } from "@/components/refinement-session/RefinementHistoryList";

export default function RefinementHistoryPage() {
  const pageTitle = usePageTitle("Refinement History");
  const { sessions, mutate, isLoading } = useRefinementSessions();

  const historySessions = useMemo(
    () => sessions.filter((s) => s.status === "completed" || s.status === "in_progress"),
    [sessions],
  );

  return (
    <>
      {pageTitle}
      <ViewHeader
        icon={<Boxes size={16} strokeWidth={1.5} />}
        actions={
          <Link
            href="/refinement"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm font-medium text-text-secondary hover:bg-overlay-subtle hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
          >
            <ArrowLeft size={13} strokeWidth={1.5} />
            Back to refinement
          </Link>
        }
      >
        <ViewHeaderTitle>Past Refinements</ViewHeaderTitle>
      </ViewHeader>

      <div className="mx-auto max-w-3xl p-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <span className="text-body-lg text-text-muted">Loading...</span>
          </div>
        ) : (
          <RefinementHistoryList sessions={historySessions} onMutate={mutate} />
        )}
      </div>
    </>
  );
}
