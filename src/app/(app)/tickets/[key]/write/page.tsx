"use client";

import { use } from "react";
import { StoryWriterLayout } from "@/components/story-writer/StoryWriterLayout";

export default function StoryWriterPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);

  return (
    <div className="h-full">
      <StoryWriterLayout ticketKey={key} />
    </div>
  );
}
