// Centralized color token references for status, score, and decorative colors.
// Client-side code should use the CSS variable references (e.g. "var(--color-status-success)").
// Server-side code (API routes) should use the RAW_* exports which contain actual hex values.

import type { JiraStatus, TicketReadiness } from "@/types/ticket";

// --- Score colors (4-band scale used by quality reviews) ---

export function getScoreColor(score: number): string {
  if (score < 60) return "var(--color-status-error)";
  if (score < 75) return "var(--color-status-warning)";
  if (score < 90) return "var(--color-status-caution)";
  return "var(--color-status-success)";
}

export function verdictLabel(score: number): { text: string; color: string } {
  if (score >= 90) return { text: "Ready for sprint", color: "var(--color-status-success)" };
  if (score >= 75) return { text: "Minor issues", color: "var(--color-status-caution)" };
  if (score >= 60) return { text: "Needs work", color: "var(--color-status-warning)" };
  return { text: "Not ready", color: "var(--color-status-error)" };
}

// --- Chat verdict / status colors ---

export function chatVerdictColor(verdict: string): string {
  if (verdict === "Ready for sprint") return "var(--color-status-done)";
  if (verdict === "Minor issues") return "var(--color-status-caution)";
  if (verdict === "Needs work") return "var(--color-status-warning)";
  return "var(--color-status-error)";
}

export function chatStatusColor(status: string): string {
  if (status === "pass" || status === "na") return "var(--color-status-done)";
  if (status === "partial") return "var(--color-status-caution)";
  return "var(--color-status-error)";
}

// --- Jira status styles ---

// Jira status colour set (BRDG-322). Collision-free with the BRDG-321 row
// markers: no status uses teal (refine) / slate (SP) / violet (BV). The key
// includes the derived "DELETED" state (a soft-delete, not a real JiraStatus)
// so this table and JIRA_STATUS_COLORS stay in lockstep and consumers stop
// hardcoding a red pill. All values are CSS-var driven so they flip per theme.
export const JIRA_STATUS_STYLES: Record<JiraStatus | "DELETED", { bg: string; text: string }> = {
  "TO DO":       { bg: "var(--color-status-todo-subtle)", text: "var(--color-status-todo)" },
  "IN PROGRESS": { bg: "var(--color-status-progress-subtle)", text: "var(--color-status-progress)" },
  TEST:          { bg: "var(--color-status-test-subtle)", text: "var(--color-status-test)" },
  DONE:          { bg: "var(--color-status-done-subtle)", text: "var(--color-status-done)" },
  DEPRECATED:    { bg: "var(--color-status-deprecated-subtle)", text: "var(--color-status-deprecated)" },
  DELETED:       { bg: "var(--color-status-deleted-subtle)", text: "var(--color-status-deleted)" },
};

// --- Readiness styles ---

export const READINESS_STYLES: Record<TicketReadiness, { color: string; bg: string }> = {
  drafting:             { color: "var(--color-status-info)", bg: "var(--color-status-info-subtle)" },
  waiting_for_feedback: { color: "var(--color-status-warning)", bg: "var(--color-status-warning-subtle)" },
  ready_to_refine:      { color: "var(--color-status-done)", bg: "var(--color-status-done-subtle)" },
  on_hold:              { color: "var(--color-status-neutral)", bg: "rgba(156, 163, 175, 0.08)" },
};

// --- PR status styles ---

export const PR_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  OPEN:     { bg: "var(--color-status-warning-subtle)", text: "var(--color-status-warning)" },
  MERGED:   { bg: "var(--color-status-success-subtle)", text: "var(--color-status-success)" },
  DECLINED: { bg: "var(--color-status-error-subtle)", text: "rgba(229, 83, 75, 0.5)" },
};

// --- Confidence styles ---

export const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: "var(--color-status-success-subtle)", text: "var(--color-status-success)", label: "High" },
  medium: { bg: "var(--color-status-caution-subtle)", text: "var(--color-status-caution)", label: "Med" },
  low:    { bg: "rgba(155, 108, 212, 0.10)", text: "var(--color-icon-epic)", label: "Low" },
};

// --- Sprint state colors ---

export const SPRINT_STATE_COLORS: Record<string, string> = {
  active: "var(--color-status-success)",
  future: "var(--color-status-info)",
};

// --- Pipeline status icon helper ---

export function pipelineStatusColor(state: string): string {
  if (state === "SUCCESSFUL") return "var(--color-status-success)";
  if (state === "FAILED") return "var(--color-status-error)";
  return "var(--color-status-warning)";
}

// --- Editor palette (hex values, used in TipTap markup) ---

export const EDITOR_PALETTE = {
  text: [
    { label: "Red",    color: "#ef4444" },
    { label: "Orange", color: "#f97316" },
    { label: "Amber",  color: "#f59e0b" },
    { label: "Green",  color: "#22c55e" },
    { label: "Blue",   color: "#3b82f6" },
    { label: "Purple", color: "#a855f7" },
    { label: "Pink",   color: "#ec4899" },
    { label: "Gray",   color: "#6b7280" },
  ],
  callout: [
    { type: "info"    as const, label: "Info",    color: "#3b82f6" },
    { type: "warning" as const, label: "Warning", color: "#f59e0b" },
    { type: "error"   as const, label: "Error",   color: "#ef4444" },
    { type: "note"    as const, label: "Note",    color: "#a855f7" },
    { type: "success" as const, label: "Success", color: "#22c55e" },
  ],
} as const;

// --- Raw hex values for server-side code (API routes) ---

export const RAW_STATUS_COLORS = {
  success:    "#4aaa60",
  error:      "#e5534b",
  warning:    "#ea8744",
  caution:    "#eab308",
  info:       "#60a5fa",
  neutral:    "#94a3b8",
  todo:       "#a1a1aa", // zinc (BRDG-322)
  progress:   "#38bdf8", // sky  (BRDG-322, was teal-ish #58b4e6)
  test:       "#f59e0b", // amber (BRDG-322)
  done:       "#22c55e",
  deprecated: "#a1a1aa", // muted zinc (BRDG-322, was muted green #7a9a7a)
  deleted:    "#f43f5e", // muted rose (BRDG-322)
  epic:       "#9b6cd4",
  sprint:     "#d4904a",
  task:       "#4a90d9",
} as const;
