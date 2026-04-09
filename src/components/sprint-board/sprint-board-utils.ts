import type { POStatus, Sprint } from "@/types/ticket";
import { mutate as globalMutate } from "swr";

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
    await fetch("/api/sprint-slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slots),
    });
  } catch (err) {
    console.error("Failed to save sprint slots:", err);
  }
}

export async function saveTicketMetadata(
  jiraKey: string,
  updates: { poStatus?: POStatus | undefined; poNotes?: string | undefined },
) {
  try {
    await fetch(`/api/tickets/${encodeURIComponent(jiraKey)}/metadata`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  } catch (err) {
    console.error("Failed to save ticket metadata:", err);
  }
}

export async function bulkReviewStories(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      const taskRes = await fetch("/api/workspace-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: "review-story-json", args: { args: key } }),
      });
      if (!taskRes.ok) continue;

      const task = await taskRes.json();
      let attempts = 0;
      while (attempts < 60) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await fetch(`/api/workspace-tasks/${task.id}`);
        if (!statusRes.ok) break;
        const statusData = await statusRes.json();
        if (statusData.status === "completed" && statusData.output) {
          const { parseReviewOutput, mapAgentReviewToResult } = await import("@/lib/agent-client");
          const agentData = parseReviewOutput(statusData.output);
          if (agentData) {
            const result = mapAgentReviewToResult(agentData);
            await fetch(`/api/tickets/${encodeURIComponent(key)}/reviews`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: "bulk-action",
                overallScore: result.overallScore,
                dimensions: result.dimensions,
                summary: result.summary,
                suggestions: result.suggestions,
              }),
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
