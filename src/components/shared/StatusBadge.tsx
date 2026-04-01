import type { JiraStatus } from "@/types/ticket";

const JIRA_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "TO DO": { bg: "rgba(148, 163, 184, 0.12)", text: "#94a3b8" },
  "IN PROGRESS": { bg: "rgba(46, 145, 73, 0.15)", text: "#4aaa60" },
  TEST: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308" },
  DONE: { bg: "rgba(46, 145, 73, 0.25)", text: "#2e9149" },
};

export { JIRA_STATUS_COLORS };

export function StatusBadge({ status }: { status: JiraStatus }) {
  const color = JIRA_STATUS_COLORS[status] || JIRA_STATUS_COLORS["TO DO"];
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {status}
    </span>
  );
}
