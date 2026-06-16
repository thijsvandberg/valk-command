"use client";

import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import type { Sprint } from "@/types/ticket";
import { useJiraSprints, useTickets, useActiveWriterSessions } from "@/hooks/useSprintBoard";
import { useConversations } from "@/hooks/useConversations";
import { useDefaultSprintId } from "@/hooks/useDefaultSprint";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { computeSprintStats, computeSprintWorkDays } from "@/components/sprint-board/sprint-board-utils";
import { extractTeamPrefix } from "@/lib/sprint-utils";
import { readSidebarSnapshot, writeSidebarSnapshot } from "@/lib/sidebar-snapshot";

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
  newStories: SidebarCount;
}

/**
 * Aggregates the live counts surfaced by the bento launcher. The popover mounts
 * its data hooks only on open, so a last-known-good snapshot (persisted to
 * localStorage) seeds the first render: the popover paints populated immediately
 * and the live sources revalidate behind it instead of flashing empty. Each
 * live value is null-safe: while a source is loading its count is null, so we
 * fall back to the snapshot; an empty source still renders label-only rather
 * than a fake zero (BRDG-317).
 */
export function useSidebarData(): SidebarData {
  const { sprints, isLoading: sprintsLoading } = useJiraSprints();
  const defaultSprintId = useDefaultSprintId();
  // The default-sprint setting only pins which TEAM is the default (e.g. BT).
  // We surface that team's currently *active* sprint so the widget follows the
  // rollover (BT: 139 -> BT: 140) automatically. Fall back to the pinned sprint
  // itself, then to any active sprint, when the team has none active.
  const activeSprint = useMemo(() => {
    const defaultSprint = defaultSprintId
      ? sprints.find((s) => String(s.id) === defaultSprintId)
      : null;
    const team = defaultSprint ? extractTeamPrefix(defaultSprint.name) : null;
    const teamActive = team
      ? sprints.find((s) => s.state === "active" && extractTeamPrefix(s.name) === team)
      : null;
    return teamActive ?? defaultSprint ?? sprints.find((s) => s.state === "active") ?? null;
  }, [sprints, defaultSprintId]);

  const { data: tickets } = useTickets(activeSprint ? String(activeSprint.id) : null);
  const { data: writerSessions } = useActiveWriterSessions();
  const { conversations, loading: conversationsLoading } = useConversations();
  const { sessions: refinementSessions, isLoading: refinementLoading } = useRefinementSessions();
  const { data: newStoriesData } = useSWR<{ count: number }>("/api/new-stories/count");

  // Last-known-good snapshot read once on mount; used as a fallback per field
  // while that field's live source is still loading.
  const [snapshot] = useState<SidebarData | null>(() => readSidebarSnapshot());

  const liveHero = useMemo<SidebarHeroData | null>(() => {
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

  const newStories = useMemo<SidebarCount>(
    () => ({ count: newStoriesData ? newStoriesData.count : null, note: "unread" }),
    [newStoriesData],
  );

  const refinement = useMemo<SidebarCount>(() => {
    if (refinementLoading) return { count: null, note: "to refine" };
    // "Next refinement" = the in-progress session if one is running, otherwise
    // the most recently created draft (sessions arrive newest-first).
    const next =
      refinementSessions.find((s) => s.status === "in_progress") ??
      refinementSessions.find((s) => s.status === "draft") ??
      null;
    return { count: next?.ticketCount ?? 0, note: "to refine" };
  }, [refinementSessions, refinementLoading]);

  // Readiness per source. Hero is ready once sprints have loaded and either
  // there is no active sprint or its tickets have arrived; the count sources are
  // ready once their loading flag clears (writer uses SWR's undefined-while-loading).
  const heroReady = !sprintsLoading && (!activeSprint || tickets != null);
  const writerReady = writerSessions !== undefined;
  const newStoriesReady = newStoriesData !== undefined;

  // Merge: prefer the live value once its source is ready, otherwise fall back
  // to the snapshot so the row stays populated during revalidation.
  const result = useMemo<SidebarData>(
    () => ({
      hero: heroReady ? liveHero : (snapshot?.hero ?? liveHero),
      chat: !conversationsLoading ? chat : (snapshot?.chat ?? chat),
      storyWriter: writerReady ? storyWriter : (snapshot?.storyWriter ?? storyWriter),
      refinement: !refinementLoading ? refinement : (snapshot?.refinement ?? refinement),
      newStories: newStoriesReady ? newStories : (snapshot?.newStories ?? newStories),
    }),
    [heroReady, liveHero, conversationsLoading, chat, writerReady, storyWriter, refinementLoading, refinement, newStoriesReady, newStories, snapshot],
  );

  // Persist only a fully-live frame, so the snapshot never captures a half-loaded
  // mix of live values and stale fallbacks.
  useEffect(() => {
    if (heroReady && !conversationsLoading && writerReady && !refinementLoading && newStoriesReady) {
      writeSidebarSnapshot({ hero: liveHero, chat, storyWriter, refinement, newStories });
    }
  }, [heroReady, conversationsLoading, writerReady, refinementLoading, newStoriesReady, liveHero, chat, storyWriter, refinement, newStories]);

  return result;
}
