"use client";

import { Suspense } from "react";
import SprintBoard from "@/components/sprint-board/SprintBoard";

export default function SprintBoardPage() {
  return (
    <div className="h-full">
      <Suspense>
        <SprintBoard />
      </Suspense>
    </div>
  );
}
