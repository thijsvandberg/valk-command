import type { POStatus, TicketReadiness, Sprint, Ticket } from "@/types/ticket";
// scopedMutate, not the top-level "swr" mutate: the app's custom cache provider
// makes the global mutate a silent no-op for every provider-backed key (BRDG-458).
import { scopedMutate } from "@/lib/swr-scoped-mutate";
import { apiFetch, tickets as ticketsApi, workspaceTasks } from "@/lib/api-client";

export function mapJiraSprints(raw: { id: number; name: string; state: string; startDate: string | null; endDate: string | null; goal?: string | null }[] | undefined): Sprint[] {
  if (!raw) return [];
  return raw.map((s) => {
    let dateRange = "";
    if (s.startDate && s.endDate) {
      const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      dateRange = `${fmt(s.startDate)} - ${fmt(s.endDate)}`;
    }
    const state = s.state === "active" ? "active" as const
      : s.state === "closed" ? "closed" as const
      : s.state === "backlog" ? "backlog" as const
      : "future" as const;
    return { id: String(s.id), name: s.name, dateRange, state, ticketCount: 0, startDate: s.startDate ?? null, endDate: s.endDate ?? null, goal: s.goal ?? null };
  });
}

/**
 * Restrict forward-planning placeholders to the active sprint scope, mirroring how tickets are
 * scoped on the All view (BRDG-304). When a sprint filter is active a placeholder surfaces only
 * if its sprint is explicitly selected by id, or its sprint's state matches a selected bucket;
 * backlog placeholders (no sprint) drop out of any sprint scope. When the scope is inactive the
 * original array is returned unchanged so downstream memo identity is preserved.
 */
export function scopePlaceholdersToSprintFilter<T extends { sprintId: string | null }>(
  placeholders: T[],
  scope: {
    active: boolean;
    selectedSprintIds: ReadonlySet<string>;
    selectedSprintStates: ReadonlySet<string>;
    sprintStateMap: Record<string, string>;
  },
): T[] {
  if (!scope.active) return placeholders;
  return placeholders.filter((p) => {
    const sid = p.sprintId;
    if (!sid) return false;
    const state = scope.sprintStateMap[sid] ?? "closed";
    return scope.selectedSprintIds.has(sid) || scope.selectedSprintStates.has(state);
  });
}

export async function saveSprintSlots(slotSprints: string[], sprints: Sprint[]) {
  const slots = slotSprints.map((sprintId, idx) => {
    const sprint = sprints.find((s) => s.id === sprintId);
    return {
      slotIndex: idx,
      sprintId,
      sprintName: sprint?.name ?? sprintId,
    };
  });

  scopedMutate("/api/sprint-slots", slots, false);

  try {
    await apiFetch("/api/sprint-slots", { method: "PUT", body: slots });
  } catch (err) {
    console.error("Failed to save sprint slots:", err);
  }
}

export async function saveTicketMetadata(
  jiraKey: string,
  updates: { readiness?: TicketReadiness | null; poStatus?: POStatus | undefined; poNotes?: string | undefined; qualityScore?: number | null; businessValue?: number | null; guestimation?: number | null },
  activeListKey?: string | null,
  // patchList=false: caller manages board display via the pendingTicketEdits overlay, so a
  // list-cache patch here would defeat the board's self-heal and cause snap-back (BRDG-383).
  // See docs/architecture/optimistic-updates.md. Callers without the overlay (e.g.
  // MultiSprintView) keep the default so their optimistic display still works.
  options: { patchList?: boolean } = {},
): Promise<boolean> {
  const patchList = options.patchList ?? true;
  const updateTicket = (ticket: Ticket): Ticket => {
    const patched = { ...ticket };
    if (updates.readiness !== undefined) patched.readiness = updates.readiness;
    if (updates.poStatus !== undefined) patched.poStatus = updates.poStatus;
    if (updates.poNotes !== undefined) patched.notes = updates.poNotes;
    if (updates.qualityScore !== undefined) patched.qualityScore = updates.qualityScore;
    if (updates.businessValue !== undefined) patched.businessValue = updates.businessValue;
    if (updates.guestimation !== undefined) patched.guestimation = updates.guestimation;
    return patched;
  };

  const detailKey = `/api/tickets/${encodeURIComponent(jiraKey)}`;

  // Optimistically update only the active ticket list (not all sprint lists)
  if (activeListKey && patchList) {
    scopedMutate(
      activeListKey,
      (current: Ticket[] | undefined) => current?.map((t) => t.key === jiraKey ? updateTicket(t) : t),
      { revalidate: false },
    );
  }
  scopedMutate(
    detailKey,
    (current: Record<string, unknown> | undefined) => current ? {
      ...current,
      ...(updates.readiness !== undefined ? { readiness: updates.readiness } : {}),
      ...(updates.poStatus !== undefined ? { poStatus: updates.poStatus } : {}),
      ...(updates.poNotes !== undefined ? { notes: updates.poNotes } : {}),
      ...(updates.qualityScore !== undefined ? { qualityScore: updates.qualityScore } : {}),
      ...(updates.businessValue !== undefined ? { businessValue: updates.businessValue } : {}),
      ...(updates.guestimation !== undefined ? { guestimation: updates.guestimation } : {}),
    } : current,
    { revalidate: false },
  );

  try {
    await ticketsApi.updateMetadata(jiraKey, updates);
    return true;
  } catch (err) {
    console.error("Failed to save ticket metadata:", err);
    if (activeListKey && patchList) scopedMutate(activeListKey);
    scopedMutate(detailKey);
    return false;
  }
}

export async function saveStoryPoints(
  jiraKey: string,
  storyPoints: number | null,
  activeListKey?: string | null,
  // See saveTicketMetadata: patchList=false when the overlay owns board display (BRDG-383).
  options: { patchList?: boolean } = {},
): Promise<boolean> {
  const patchList = options.patchList ?? true;
  const detailKey = `/api/tickets/${encodeURIComponent(jiraKey)}`;

  if (activeListKey && patchList) {
    scopedMutate(
      activeListKey,
      (current: Ticket[] | undefined) => current?.map((t) => t.key === jiraKey ? { ...t, storyPoints } : t),
      { revalidate: false },
    );
  }
  scopedMutate(
    detailKey,
    (current: Record<string, unknown> | undefined) => current ? { ...current, storyPoints } : current,
    { revalidate: false },
  );

  try {
    await ticketsApi.updateStoryPoints(jiraKey, storyPoints);
    return true;
  } catch (err) {
    console.error("Failed to save story points:", err);
    if (activeListKey && patchList) scopedMutate(activeListKey);
    scopedMutate(detailKey);
    return false;
  }
}

export async function bulkReviewStories(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      const task = await workspaceTasks.create({ skill: "review-story-json", args: { args: key } });
      let attempts = 0;
      while (attempts < 60) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusData = await workspaceTasks.get(task.id) as { status: string; output?: string };
        if (statusData.status === "completed" && statusData.output) {
          const { parseReviewOutput, mapAgentReviewToResult } = await import("@/lib/agent-client");
          const agentData = parseReviewOutput(statusData.output);
          if (agentData) {
            const result = mapAgentReviewToResult(agentData);
            await ticketsApi.createReview(key, {
              source: "bulk-action",
              overallScore: result.overallScore,
              dimensions: result.dimensions,
              summary: result.summary,
              suggestions: result.suggestions,
            });
          }
          break;
        }
        if (statusData.status === "failed") break;
        attempts++;
      }
    } catch {
      // Individual review failures should not stop the batch
    }
  }
}

export async function bulkGenerateSubtasks(keys: string[]): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      await ticketsApi.suggestSubtasks(key);
      succeeded++;
    } catch {
      failed++;
    }
  }
  return { succeeded, failed };
}

export interface SprintStats {
  todoCount: number;
  inProgressCount: number;
  testCount: number;
  doneCount: number;
  totalPoints: number;
  noPointsCount: number;
  deprecatedWithSp: number;
  bvTotal: number;
  bvScoredCount: number;
  bvAvg: string | null;
  statusStats: Record<string, { sp: number; bv: number }>;
}

export function computeSprintStats(tickets: Ticket[]): SprintStats {
  let todo = 0, inProg = 0, test = 0, done = 0, pts = 0, noPts = 0, deprSp = 0, bvT = 0, bvC = 0;
  const stats: Record<string, { sp: number; bv: number }> = {};
  for (const t of tickets) {
    if (t.jiraStatus === "TO DO") todo++;
    else if (t.jiraStatus === "IN PROGRESS") inProg++;
    else if (t.jiraStatus === "TEST") test++;
    else if (t.jiraStatus === "DONE") done++;
    pts += t.storyPoints || 0;
    if (t.storyPoints == null && t.jiraStatus !== "DEPRECATED" && t.type !== "spike") noPts++;
    if (t.jiraStatus === "DEPRECATED" && t.storyPoints != null && t.storyPoints > 0) deprSp++;
    if (t.businessValue != null && t.businessValue >= 1 && t.jiraStatus !== "DEPRECATED") {
      bvT += t.businessValue;
      bvC++;
    }
    const s = stats[t.jiraStatus] ?? (stats[t.jiraStatus] = { sp: 0, bv: 0 });
    s.sp += t.storyPoints ?? 0;
    s.bv += t.businessValue ?? 0;
  }
  return {
    todoCount: todo, inProgressCount: inProg, testCount: test, doneCount: done,
    totalPoints: pts, noPointsCount: noPts, deprecatedWithSp: deprSp,
    bvTotal: bvT, bvScoredCount: bvC,
    bvAvg: bvC > 0 ? (bvT / bvC).toFixed(1) : null,
    statusStats: stats,
  };
}

export function computeSprintWorkDays(sprint: Sprint | null | undefined): { remaining: number | null; total: number | null } {
  if (!sprint || sprint.state !== "active" || !sprint.startDate || !sprint.endDate) return { remaining: null, total: null };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(sprint.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(sprint.endDate);
  end.setHours(0, 0, 0, 0);
  let total = 0;
  const d1 = new Date(start);
  while (d1 <= end) { if (d1.getDay() !== 0 && d1.getDay() !== 6) total++; d1.setDate(d1.getDate() + 1); }
  let remaining = 0;
  if (end >= now) {
    const d2 = new Date(now);
    while (d2 <= end) { if (d2.getDay() !== 0 && d2.getDay() !== 6) remaining++; d2.setDate(d2.getDate() + 1); }
  }
  return { remaining, total };
}

// BRDG-426: decide (once per sprint) whether the board should auto-reveal the
// test-doc row marker. Fires when the active sprint has entered its last
// working day (remaining <= 1, which also covers opening Bridge after the end
// date while the sprint is still open). The localStorage flag makes it
// once-only: switching the marker off afterwards sticks.
export function shouldAutoEnableTestDocTag(
  sprintId: string | null | undefined,
  remainingWorkDays: number | null,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): boolean {
  if (!sprintId || remainingWorkDays === null || remainingWorkDays > 1) return false;
  const flagKey = `bridge:test-doc-tag-auto:${sprintId}`;
  try {
    if (storage.getItem(flagKey)) return false;
    storage.setItem(flagKey, "1");
    return true;
  } catch {
    return false;
  }
}
