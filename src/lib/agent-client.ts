/**
 * Client for the valk-agent remote workspace API.
 * All requests go through Next.js API routes (server-side proxy)
 * to keep the agent URL and auth token out of the browser.
 */

export interface TaskSubmission {
  skill: string;
  args: Record<string, string>;
  conversationId: string;
}

export interface TaskResponse {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  skill: string;
  streamUrl: string;
}

export interface TaskDetail {
  id: string;
  skill: string;
  args: Record<string, string>;
  conversationId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  sessionId?: string;
}

export interface SSEEvent {
  event: "status" | "progress" | "tool_call" | "tool_result" | "result" | "error" | "done";
  data: Record<string, unknown>;
}

export interface SkillInfo {
  id: string;
  name: string;
  timeout: number;
}

export async function submitTask(submission: TaskSubmission): Promise<TaskResponse> {
  const res = await fetch("/api/workspace-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to submit task (${res.status})`);
  }
  return res.json();
}

export async function getTask(taskId: string): Promise<TaskDetail> {
  const res = await fetch(`/api/workspace-tasks/${taskId}`);
  if (!res.ok) throw new Error(`Failed to get task (${res.status})`);
  return res.json();
}

export async function cancelTask(taskId: string): Promise<void> {
  const res = await fetch(`/api/workspace-tasks/${taskId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to cancel task (${res.status})`);
}

export async function listSkills(): Promise<SkillInfo[]> {
  const res = await fetch("/api/workspace-tasks/skills");
  if (!res.ok) throw new Error(`Failed to list skills (${res.status})`);
  return res.json();
}

/**
 * Parse a user message to detect skill invocations.
 * "/review-story VPL-1456" -> { skill: "review-story", args: { input: "VPL-1456" } }
 * "hello world" -> null
 */
export function parseSkillInvocation(
  input: string
): { skill: string; args: Record<string, string> } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const skill = parts[0];
  if (!skill) return null;

  const rest = parts.slice(1).join(" ");
  return {
    skill,
    args: rest ? { input: rest } : {},
  };
}
