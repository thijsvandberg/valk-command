"use client";

import { useCallback, useMemo } from "react";
import { tickets, jira } from "@/lib/api-client";
import { patchTicketCaches, revalidateTicketCaches } from "@/lib/ticket-cache";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { useFollowedTickets, useFollowTicket } from "@/hooks/usePipelines";
import { mapJiraSprints } from "@/components/sprint-board/sprint-board-utils";
import type { Sprint, Assignee } from "@/types/ticket";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";

// Sentinel the move-sprint endpoint expects for "send to backlog".
const BACKLOG_TARGET = "__backlog__";

// Minimal Assignee for the brief optimistic window; revalidation replaces it
// with the canonical avatar/colour from the server.
function assignableToAssignee(user: AssignableUser): Assignee {
  const name = user.displayName;
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return { name, initials, color: `hsl(${Math.abs(hash) % 360} 60% 50%)` };
}

export interface HoverCardEdits {
  sprints: Sprint[];
  isFollowed: boolean;
  onStoryPointsChange: (value: number | null) => void;
  onBusinessValueChange: (value: number | null) => void;
  onSprintChange: (sprintId: string | null) => void;
  onEpicChange: (epic: EpicOption | null) => void;
  onAssigneeChange: (user: AssignableUser | null) => void;
  onToggleFollow: () => void;
  onRunReview: () => Promise<void>;
}

/**
 * Default, self-contained editing handlers for the ticket hover card. Mounted
 * lazily with the card (one at a time on hover), so the SWR subscriptions here
 * cost nothing per row. Every handler persists via the shared API, optimistically
 * patches all ticket caches, then revalidates. Consumers that maintain their own
 * optimistic list (board) pass explicit handlers that take precedence over these.
 */
export function useHoverCardEdits(ticketKey: string): HoverCardEdits {
  const { sprints: rawSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawSprints), [rawSprints]);
  const { data: followed } = useFollowedTickets();
  const { follow, unfollow } = useFollowTicket();
  const isFollowed = followed?.includes(ticketKey) ?? false;

  const persist = useCallback(
    async (patch: Record<string, unknown>, call: () => Promise<unknown>) => {
      await patchTicketCaches(ticketKey, patch);
      try {
        await call();
      } finally {
        revalidateTicketCaches();
      }
    },
    [ticketKey],
  );

  const onStoryPointsChange = useCallback(
    (value: number | null) => {
      void persist({ storyPoints: value }, () => tickets.updateStoryPoints(ticketKey, value));
    },
    [persist, ticketKey],
  );

  const onBusinessValueChange = useCallback(
    (value: number | null) => {
      void persist({ businessValue: value }, () => tickets.updateMetadata(ticketKey, { businessValue: value }));
    },
    [persist, ticketKey],
  );

  const onSprintChange = useCallback(
    (sprintId: string | null) => {
      void persist({ sprintId: sprintId ?? undefined }, () =>
        jira.moveSprint({ issueKeys: [ticketKey], targetSprintId: sprintId ?? BACKLOG_TARGET }),
      );
    },
    [persist, ticketKey],
  );

  const onEpicChange = useCallback(
    (epic: EpicOption | null) => {
      void persist({ epic: epic?.name ?? null, epicKey: epic?.key ?? null }, () =>
        tickets.updateEpic(ticketKey, epic?.key ?? null),
      );
    },
    [persist, ticketKey],
  );

  const onAssigneeChange = useCallback(
    (user: AssignableUser | null) => {
      void persist({ assignee: user ? assignableToAssignee(user) : null }, () =>
        jira.assign({ issueKey: ticketKey, accountId: user?.accountId ?? null, name: user?.displayName ?? null }),
      );
    },
    [persist, ticketKey],
  );

  const onToggleFollow = useCallback(() => {
    void (isFollowed ? unfollow(ticketKey) : follow(ticketKey));
  }, [isFollowed, follow, unfollow, ticketKey]);

  const onRunReview = useCallback(async () => {
    const { bulkReviewStories } = await import("@/components/sprint-board/sprint-board-utils");
    await bulkReviewStories([ticketKey]);
    revalidateTicketCaches();
  }, [ticketKey]);

  return {
    sprints,
    isFollowed,
    onStoryPointsChange,
    onBusinessValueChange,
    onSprintChange,
    onEpicChange,
    onAssigneeChange,
    onToggleFollow,
    onRunReview,
  };
}
