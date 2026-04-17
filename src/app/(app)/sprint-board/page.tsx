"use client";

import { Suspense } from "react";
import SprintBoard from "@/components/sprint-board/SprintBoard";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { LoadingState } from "@/components/shared/LoadingState";

export default function SprintBoardPage() {
  return (
    <div className="h-full">
      <ErrorBoundary>
        <Suspense fallback={<LoadingState variant="spinner" label="Loading sprint board..." />}>
          <SprintBoard />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
