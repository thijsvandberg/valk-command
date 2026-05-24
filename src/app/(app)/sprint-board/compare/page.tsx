"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { mapJiraSprints } from "@/components/sprint-board/sprint-board-utils";
import { MultiSprintView } from "@/components/sprint-board/MultiSprintView";
import { LoadingState } from "@/components/shared/LoadingState";
import { usePageTitle } from "@/hooks/usePageTitle";

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { sprints: rawJiraSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawJiraSprints), [rawJiraSprints]);

  const left = searchParams.get("left") ?? "";
  const right = searchParams.get("right") ?? "";

  // Fall back gracefully if params are missing or sprints haven't loaded yet
  if (!sprints.length) {
    return <LoadingState variant="spinner" label="Loading sprints..." />;
  }

  const initialLeft = left || sprints[0]?.id || "";
  const initialRight = right || sprints[1]?.id || sprints[0]?.id || "";

  function handleSprintChange(side: "left" | "right", sprintId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(side, sprintId);
    router.replace(`/sprint-board/compare?${params.toString()}`);
  }

  return (
    <MultiSprintView
      initialLeft={initialLeft}
      initialRight={initialRight}
      sprints={sprints}
      onClose={() => router.push("/sprint-board")}
      onSprintChange={handleSprintChange}
    />
  );
}

export const dynamic = "force-dynamic";

export default function SprintBoardComparePage() {
  const pageTitle = usePageTitle("Compare Sprints");
  return (
    <>
      {pageTitle}
      <Suspense fallback={<LoadingState variant="spinner" label="Loading compare view..." />}>
        <CompareContent />
      </Suspense>
    </>
  );
}
