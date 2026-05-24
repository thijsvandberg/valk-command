import type { POStatus, TicketReadiness, Sprint, Ticket } from "@/types/ticket";
import { mutate as globalMutate } from "swr";
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

export async function saveSprintSlots(slotSprints: string[], sprints: Sprint[]) {
  const slots = slotSprints.map((sprintId, idx) => {
    const sprint = sprints.find((s) => s.id === sprintId);
    return {
      slotIndex: idx,
      sprintId,
      sprintName: sprint?.name ?? sprintId,
    };
  });

  globalMutate("/api/sprint-slots", slots, false);

  try {
    await apiFetch("/api/sprint-slots", { method: "PUT", body: slots });
  } catch (err) {
    console.error("Failed to save sprint slots:", err);
  }
}

export async function saveTicketMetadata(
  jiraKey: string,
  updates: { readiness?: TicketReadiness | null; poStatus?: POStatus | undefined; poNotes?: string | undefined; qualityScore?: number | null; businessValue?: number | null },
  activeListKey?: string | null,
): Promise<boolean> {
  const updateTicket = (ticket: Ticket): Ticket => {
    const patched = { ...ticket };
    if (updates.readiness !== undefined) patched.readiness = updates.readiness;
    if (updates.poStatus !== undefined) patched.poStatus = updates.poStatus;
    if (updates.poNotes !== undefined) patched.notes = updates.poNotes;
    if (updates.qualityScore !== undefined) patched.qualityScore = updates.qualityScore;
    if (updates.businessValue !== undefined) patched.businessValue = updates.businessValue;
    return patched;
  };

  const detailKey = `/api/tickets/${encodeURIComponent(jiraKey)}`;

  // Optimistically update only the active ticket list (not all sprint lists)
  if (activeListKey) {
    globalMutate(
      activeListKey,
      (current: Ticket[] | undefined) => current?.map((t) => t.key === jiraKey ? updateTicket(t) : t),
      { revalidate: false },
    );
  }
  globalMutate(
    detailKey,
    (current: Record<string, unknown> | undefined) => current ? {
      ...current,
      ...(updates.readiness !== undefined ? { readiness: updates.readiness } : {}),
      ...(updates.poStatus !== undefined ? { poStatus: updates.poStatus } : {}),
      ...(updates.poNotes !== undefined ? { notes: updates.poNotes } : {}),
      ...(updates.qualityScore !== undefined ? { qualityScore: updates.qualityScore } : {}),
      ...(updates.businessValue !== undefined ? { businessValue: updates.businessValue } : {}),
    } : current,
    { revalidate: false },
  );

  try {
    await ticketsApi.updateMetadata(jiraKey, updates);
    return true;
  } catch (err) {
    console.error("Failed to save ticket metadata:", err);
    if (activeListKey) globalMutate(activeListKey);
    globalMutate(detailKey);
    return false;
  }
}

export async function saveStoryPoints(
  jiraKey: string,
  storyPoints: number | null,
  activeListKey?: string | null,
): Promise<boolean> {
  const detailKey = `/api/tickets/${encodeURIComponent(jiraKey)}`;

  if (activeListKey) {
    globalMutate(
      activeListKey,
      (current: Ticket[] | undefined) => current?.map((t) => t.key === jiraKey ? { ...t, storyPoints } : t),
      { revalidate: false },
    );
  }
  globalMutate(
    detailKey,
    (current: Record<string, unknown> | undefined) => current ? { ...current, storyPoints } : current,
    { revalidate: false },
  );

  try {
    await ticketsApi.updateStoryPoints(jiraKey, storyPoints);
    return true;
  } catch (err) {
    console.error("Failed to save story points:", err);
    if (activeListKey) globalMutate(activeListKey);
    globalMutate(detailKey);
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
