"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { tickets, swrFetcher } from "@/lib/api-client";
import { buildTicketHoverData } from "@/hooks/useTicketHoverData";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import type { TicketDetailResponse } from "@/lib/ticket-detail-builder";

interface TicketRefPillProps {
  ticketKey: string;
}

/**
 * Inline, read-only ticket reference rendered from a bare key found in plain
 * description text (see renderMarkdown linkification). The key + link paint
 * immediately; once the description has rendered, each pill fetches its own
 * ticket so the issue-type icon, status and hover-card fill in (deferred to a
 * post-mount effect so it never blocks the page's first paint). Fetches dedupe
 * per key via SWR and the per-key endpoint is cached server-side, so many refs
 * in one description stay cheap. Unresolved keys (Jira-only / not synced) still
 * render a working link, just without the extra detail.
 */
export function TicketRefPill({ ticketKey }: TicketRefPillProps) {
  // SWR fetches in a post-mount effect, so the key + link paint first and the
  // ticket detail (issue-type icon, status, hover card) fills in right after,
  // without blocking the description's first render.
  const { data } = useSWR<TicketDetailResponse>(
    tickets.detailUrl(ticketKey),
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000, shouldRetryOnError: false },
  );

  // Resolve the sprint id to its display name for the hover card (SWR-cached,
  // shared across pills). Falls back to the raw id when sprints aren't loaded.
  const { sprints } = useJiraSprints();
  const sprintNames = useMemo(() => {
    const m: Record<string, string> = {};
    sprints.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [sprints]);

  const hoverData = data ? buildTicketHoverData(data, sprintNames) : undefined;

  return (
    // Strip the description's anchor underline AND link color (.description-content a
    // paints both) so the key reads as a pill chip, not a link; !important beats
    // that higher-specificity rule, including its :hover variant.
    <span className="inline-flex align-middle [&_a]:!no-underline [&_a]:!text-text-primary">
      <TicketStatusPill
        ticketKey={ticketKey}
        jiraStatus={data?.jiraStatus ?? "TO DO"}
        issueType={data?.type}
        title={data?.title}
        size="sm"
        showReadiness={false}
        showStatus={!!data}
        hoverData={hoverData}
      />
    </span>
  );
}
