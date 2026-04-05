"use client";

import { use } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { StoryWriterLayout } from "@/components/story-writer/StoryWriterLayout";

export default function StoryWriterPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const { data: ticketData } = useTicketDetail(key);
  const pageTitle = usePageTitle(
    ticketData?.title ? `${key} - ${ticketData.title} - Story Writer` : `${key} - Story Writer`
  );

  return (
    <>
      {pageTitle}
      <div className="h-full">
        <StoryWriterLayout ticketKey={key} />
      </div>
    </>
  );
}
