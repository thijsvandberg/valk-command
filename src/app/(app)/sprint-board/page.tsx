"use client";

import { Suspense } from "react";
import SprintBoard from "@/components/sprint-board/SprintBoard";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export default function SprintBoardPage() {
  return (
    <div className="h-full">
      <ErrorBoundary>
        <Suspense>
          <SprintBoard />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
