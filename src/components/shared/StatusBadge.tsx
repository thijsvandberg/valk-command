import type { JiraStatus } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "@/types/ticket";

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
