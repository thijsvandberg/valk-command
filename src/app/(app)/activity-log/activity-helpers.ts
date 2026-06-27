import { swrFetcher } from "@/lib/api-client";
import type { ActivityLogEntry } from "@/types/ticket";

// The entries fetcher must NOT swallow failures: surfacing SWR's `error` is how
// the Activity Log shows a visible, recoverable error instead of a blank table
// (BRDG-423). Stats remain best-effort (the dashboards above the table are
// secondary), so statsFetcher keeps its soft fallback.
export const fetcher = swrFetcher;
export const statsFetcher = <T,>(url: string) => swrFetcher<T>(url).catch(() => null as unknown as T);

export const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "sprint-sync", label: "Sprint sync" },
  { value: "ticket-sync", label: "Ticket sync" },
  { value: "single-ticket", label: "Single ticket" },
  { value: "comment-sync", label: "Comment sync" },
  { value: "review", label: "Review" },
  { value: "metadata-update", label: "Metadata update" },
  { value: "local-edit", label: "Local edit" },
  { value: "push-to-jira", label: "Push to Jira" },
  { value: "bulk-action", label: "Bulk action" },
  { value: "story-writer", label: "Story writer" },
  { value: "incremental-sync", label: "Incremental sync" },
];

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

export const PAGE_SIZE = 30;

export function entryTypeLabel(type: ActivityLogEntry["type"]): string {
  const labels: Record<ActivityLogEntry["type"], string> = {
    "sprint-sync": "Sprint sync",
    "ticket-sync": "Ticket sync",
    "single-ticket": "Single ticket",
    "comment-sync": "Comment sync",
    "review": "Review",
    "metadata-update": "Metadata update",
    "local-edit": "Local edit",
    "push-to-jira": "Push to Jira",
    "bulk-action": "Bulk action",
    "story-writer": "Story writer",
    "incremental-sync": "Incremental sync",
    "epic-sync": "Epic sync",
    "deprecation-scan": "Staleness scan",
  };
  return labels[type] ?? type;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (isToday) return time;

  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${day} ${time}`;
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Parse errorDetail if it's JSON from agent-fetch; otherwise return as plain string. */
export function parseErrorDetail(raw: string | null): { display: string; structured: Record<string, unknown> | null } {
  if (!raw) return { display: "", structured: null };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const parts: string[] = [];
      if (typeof parsed.code === "string") parts.push(parsed.code);
      if (typeof parsed.error === "string" && parsed.error !== parsed.code) parts.push(parsed.error);
      if (typeof parsed.httpStatus === "number" && parsed.httpStatus > 0) parts.push(`HTTP ${parsed.httpStatus}`);
      if (typeof parsed.retryCount === "number" && parsed.retryCount > 0) parts.push(`${parsed.retryCount} retr${parsed.retryCount === 1 ? "y" : "ies"}`);
      return { display: parts.join(" · ") || raw, structured: parsed as Record<string, unknown> };
    }
  } catch { /* not JSON */ }
  return { display: raw, structured: null };
}
