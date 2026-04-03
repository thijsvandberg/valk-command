"use client";

import { use } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { StoryWriterLayout } from "@/components/story-writer/StoryWriterLayout";

export default function StoryWriterPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  usePageTitle(`Story Writer - ${key}`);

  return (
    <div className="h-full">
      <StoryWriterLayout ticketKey={key} />
    </div>
  );
}
