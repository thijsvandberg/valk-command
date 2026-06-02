"use client";

import { Layers } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { useEpicProgress } from "@/hooks/useEpics";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { EpicRow } from "./EpicRow";
import { EpicListSkeleton } from "./loading";

export default function EpicsPage() {
  const { data: epics, isLoading } = useEpicProgress();
  const { sprints } = useJiraSprints();

  return (
    <div className="flex h-full flex-col">
      <ViewHeader icon={<Layers size={16} strokeWidth={1.5} />}>
        <ViewHeaderTitle>Epics</ViewHeaderTitle>
        {epics && epics.length > 0 && (
          <span className="ml-2 rounded-md bg-overlay-default px-2 py-0.5 text-caption font-medium tabular-nums text-text-tertiary">
            {epics.length}
          </span>
        )}
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="mb-5 text-body-sm text-text-tertiary">
            Feature-level progress across the active sprint, the two most recent closed sprints, and the backlog.
          </p>

          {isLoading ? (
            <EpicListSkeleton />
          ) : !epics || epics.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-default py-16 text-center">
              <Layers size={28} strokeWidth={1.5} className="mb-3 text-text-muted" />
              <p className="text-body text-text-secondary">No epics with tickets in the recent sprints.</p>
              <p className="mt-1 text-body-sm text-text-muted">
                Epics appear here once their tickets land in a recent sprint or the backlog.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {epics.map((epic) => (
                <EpicRow key={epic.key} epic={epic} sprints={sprints} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
