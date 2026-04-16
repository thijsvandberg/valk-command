import type { POStatus, Sprint, Ticket } from "@/types/ticket";
import { mutate as globalMutate } from "swr";
import { apiFetch, tickets as ticketsApi, workspaceTasks } from "@/lib/api-client";

export function mapJiraSprints(raw: { id: number; name: string; state: string; startDate: string | null; endDate: string | null }[] | undefined): Sprint[] {
  if (!raw) return [];
  return raw.map((s) => {
    let dateRange = "";
    if (s.startDate && s.endDate) {
      const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      dateRange = `${fmt(s.startDate)} - ${fmt(s.endDate)}`;
    }
    const state = s.state === "active" ? "active" as const
      : s.state === "closed" ? "closed" as const
      : "future" as const;
    return { id: String(s.id), name: s.name, dateRange, state, ticketCount: 0 };
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
  updates: { poStatus?: POStatus | undefined; poNotes?: string | undefined; qualityScore?: number | null },
): Promise<boolean> {
  // Optimistically update SWR cache for ticket lists and detail
  const updateTicket = (ticket: Ticket): Ticket => {
    const patched = { ...ticket };
    if (updates.poStatus !== undefined) patched.poStatus = updates.poStatus;
    if (updates.poNotes !== undefined) patched.notes = updates.poNotes;
    if (updates.qualityScore !== undefined) patched.qualityScore = updates.qualityScore;
    return patched;
  };

  // Optimistically update ticket list caches
  globalMutate(
    (key) => typeof key === "string" && key.startsWith("/api/tickets?"),
    (current: Ticket[] | undefined) => current?.map((t) => t.key === jiraKey ? updateTicket(t) : t),
    { revalidate: false },
  );
  // Optimistically update ticket detail cache
  globalMutate(
    `/api/tickets/${encodeURIComponent(jiraKey)}`,
    (current: Record<string, unknown> | undefined) => current ? { ...current, ...updates.poStatus !== undefined ? { poStatus: updates.poStatus } : {}, ...updates.poNotes !== undefined ? { notes: updates.poNotes } : {}, ...updates.qualityScore !== undefined ? { qualityScore: updates.qualityScore } : {} } : current,
    { revalidate: false },
  );

  try {
    await ticketsApi.updateMetadata(jiraKey, updates);
    return true;
  } catch (err) {
    console.error("Failed to save ticket metadata:", err);
    // Revalidate to roll back optimistic updates
    globalMutate((key) => typeof key === "string" && key.startsWith("/api/tickets"), undefined, { revalidate: true });
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
