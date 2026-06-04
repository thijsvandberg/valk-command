"use client";

import { useCallback, useMemo } from "react";
import { mutate as globalMutate } from "swr";
import { tickets, jira } from "@/lib/api-client";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { useFollowedTickets, useFollowTicket } from "@/hooks/usePipelines";
import { mapJiraSprints } from "@/components/sprint-board/sprint-board-utils";
import type { Sprint, Assignee } from "@/types/ticket";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";

// Sentinel the move-sprint endpoint expects for "send to backlog".
const BACKLOG_TARGET = "__backlog__";

// Every SWR cache that can hold this ticket: the board list, a sprint-scoped
// list, or the per-key detail. Patching all of them keeps any open card and any
// list in sync without each consumer having to wire handlers.
function ticketCacheMatcher(ticketKey: string) {
  const detailKey = `/api/tickets/${encodeURIComponent(ticketKey)}`;
  return (k: unknown) =>
    typeof k === "string" &&
    (k === "/api/tickets" || k.startsWith("/api/tickets?") || k === detailKey);
}

// Optimistically merge `patch` into every cached copy of the ticket (list
// element or detail object), without revalidating yet.
function patchCaches(ticketKey: string, patch: Record<string, unknown>) {
  return globalMutate(
    ticketCacheMatcher(ticketKey),
    (current: unknown) => {
      if (Array.isArray(current)) {
        return current.map((t) =>
          t && typeof t === "object" && (t as { key?: string }).key === ticketKey
            ? { ...t, ...patch }
            : t,
        );
      }
      if (current && typeof current === "object" && (current as { key?: string }).key === ticketKey) {
        return { ...current, ...patch };
      }
      return current;
    },
    { revalidate: false },
  );
}

// Revalidate every ticket-related cache (list, sprint lists, all details) so a
// change to a child also refreshes the parent epic's child list, etc.
function revalidateTickets() {
  return globalMutate((k) => typeof k === "string" && k.startsWith("/api/tickets"));
}

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
      await patchCaches(ticketKey, patch);
      try {
        await call();
      } finally {
        revalidateTickets();
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
    revalidateTickets();
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
