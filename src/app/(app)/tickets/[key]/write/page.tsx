"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { StoryWriterLayout } from "@/components/story-writer/StoryWriterLayout";

export default function StoryWriterPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const searchParams = useSearchParams();
  const { data: ticketData } = useTicketDetail(key);

  // For draft keys, use URL params as initial metadata before the DB record exists
  const draftTitle = searchParams.get("title") ?? undefined;
  const draftType = searchParams.get("type") ?? undefined;

  const displayTitle = ticketData?.title ?? draftTitle;
  const pageTitle = usePageTitle(
    displayTitle ? `${key} - ${displayTitle} - Story Writer` : `${key} - Story Writer`
  );

  return (
    <>
      {pageTitle}
      <div className="h-full">
        <StoryWriterLayout
          ticketKey={key}
          draftTitle={draftTitle}
          draftType={draftType}
        />
      </div>
    </>
  );
}
