"use client";

import { useMemo } from "react";
import type { Sprint } from "@/types/ticket";
import { useJiraSprints, useTickets, useActiveWriterSessions } from "@/hooks/useSprintBoard";
import { useConversations } from "@/hooks/useConversations";
import { computeSprintStats, computeSprintWorkDays } from "@/components/sprint-board/sprint-board-utils";

export interface SidebarHeroData {
  /** Active sprint name, used as the hero key (e.g. "BT: 139"). */
  sprintKey: string;
  todo: number;
  inProgress: number;
  done: number;
  /** Completion ratio 0..1, or null when there are no tickets to measure. */
  progress: number | null;
  /** Working days elapsed / total for the active sprint, or null. */
  dayX: number | null;
  dayY: number | null;
}

export interface SidebarCount {
  /** Numeric count, or null while loading / when the source is empty. */
  count: number | null;
  note: string;
}

export interface SidebarData {
  hero: SidebarHeroData | null;
  chat: SidebarCount;
  storyWriter: SidebarCount;
  refinement: SidebarCount;
}

/**
 * Aggregates the live counts surfaced by the bento launcher. Every source is
 * already SWR/context-cached, so reading them from the always-mounted Sidebar is
 * cheap. Each value is null-safe: when data is loading or empty the count is
 * null, so rows render label-only instead of showing a fake zero (BRDG-317).
 */
export function useSidebarData(): SidebarData {
  const { sprints } = useJiraSprints();
  const activeSprint = useMemo(
    () => sprints.find((s) => s.state === "active") ?? null,
    [sprints],
  );

  const { data: tickets } = useTickets(activeSprint ? String(activeSprint.id) : null);
  const { data: writerSessions } = useActiveWriterSessions();
  const { conversations, loading: conversationsLoading } = useConversations();

  const hero = useMemo<SidebarHeroData | null>(() => {
    if (!activeSprint) return null;
    const stats = tickets ? computeSprintStats(tickets) : null;
    const total = stats
      ? stats.todoCount + stats.inProgressCount + stats.testCount + stats.doneCount
      : 0;
    const sprint: Sprint = {
      id: String(activeSprint.id),
      name: activeSprint.name,
      dateRange: "",
      state: activeSprint.state as Sprint["state"],
      ticketCount: 0,
      startDate: activeSprint.startDate,
      endDate: activeSprint.endDate,
      goal: activeSprint.goal,
    };
    const { remaining, total: totalDays } = computeSprintWorkDays(sprint);
    return {
      sprintKey: activeSprint.name,
      todo: stats?.todoCount ?? 0,
      inProgress: stats?.inProgressCount ?? 0,
      done: stats?.doneCount ?? 0,
      progress: stats && total > 0 ? stats.doneCount / total : null,
      // dayX = elapsed working days = total - remaining (clamped at 0).
      dayX: totalDays != null && remaining != null ? Math.max(0, totalDays - remaining) : null,
      dayY: totalDays,
    };
  }, [activeSprint, tickets]);

  const chat = useMemo<SidebarCount>(() => {
    if (conversationsLoading) return { count: null, note: "unread" };
    const unread = conversations.filter((c) => c.readAt === null).length;
    return { count: unread, note: "unread" };
  }, [conversations, conversationsLoading]);

  const storyWriter = useMemo<SidebarCount>(
    () => ({ count: writerSessions ? writerSessions.length : null, note: "drafts" }),
    [writerSessions],
  );

  const refinement = useMemo<SidebarCount>(() => {
    if (!tickets) return { count: null, note: "to refine" };
    const toRefine = tickets.filter((t) => t.readiness === "ready_to_refine").length;
    return { count: toRefine, note: "to refine" };
  }, [tickets]);

  return { hero, chat, storyWriter, refinement };
}
