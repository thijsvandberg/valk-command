import type { JiraStatus } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "@/types/ticket";

export { JIRA_STATUS_COLORS };

export function StatusBadge({
  status,
  className,
}: {
  status: JiraStatus;
  className?: string;
}) {
  const color = JIRA_STATUS_COLORS[status] || JIRA_STATUS_COLORS["TO DO"];
  // DEPRECATED is struck through so it reads as outside the lifecycle flow
  // (BRDG-322). DELETED is a derived state rendered by its own call sites.
  const struck = status === "DEPRECATED";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-body-sm font-medium${struck ? " line-through" : ""}${className ? ` ${className}` : ""}`}
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {status}
    </span>
  );
}
