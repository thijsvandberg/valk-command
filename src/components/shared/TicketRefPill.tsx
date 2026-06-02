"use client";

import { useState } from "react";
import useSWR from "swr";
import { tickets, swrFetcher } from "@/lib/api-client";
import { buildTicketHoverData } from "@/hooks/useTicketHoverData";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import type { TicketDetailResponse } from "@/lib/ticket-detail-builder";

interface TicketRefPillProps {
  ticketKey: string;
}

/**
 * Inline, read-only ticket reference rendered from a bare key found in plain
 * description text (see renderMarkdown linkification). The pill paints
 * immediately with just the key + link; the richer hover-card data is fetched
 * lazily on first hover so a description with many refs never blocks on a fan
 * of ticket lookups. Unresolved keys (Jira-only / not synced) still render a
 * working link, just without a hover card.
 */
export function TicketRefPill({ ticketKey }: TicketRefPillProps) {
  const [hovered, setHovered] = useState(false);

  const { data } = useSWR<TicketDetailResponse>(
    hovered ? tickets.detailUrl(ticketKey) : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000, shouldRetryOnError: false },
  );

  const hoverData = data ? buildTicketHoverData(data) : undefined;

  return (
    <span
      className="inline-flex align-middle"
      onMouseEnter={() => setHovered(true)}
      onFocus={() => setHovered(true)}
    >
      <TicketStatusPill
        ticketKey={ticketKey}
        jiraStatus={data?.jiraStatus ?? "TO DO"}
        issueType={data?.type}
        title={data?.title}
        size="sm"
        showReadiness={false}
        hoverData={hoverData}
      />
    </span>
  );
}
