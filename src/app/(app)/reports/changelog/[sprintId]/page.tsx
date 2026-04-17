"use client";

import { use } from "react";
import { ChangelogView } from "@/components/changelog/ChangelogView";

export default function ChangelogPage({ params }: { params: Promise<{ sprintId: string }> }) {
  const { sprintId } = use(params);
  return (
    <div className="flex h-full flex-col">
      <ChangelogView sprintId={sprintId} />
    </div>
  );
}
