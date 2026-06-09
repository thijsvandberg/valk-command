import type { JiraStatus } from "@/types/ticket";
import { StatusBadge } from "@/components/shared/StatusBadge";

// Shared Status filter option renderer. Used by both the Sprint Board FilterBar and the
// dedicated search filter panel so the Status dropdown stays identical across the app (BRDG-324).
export function StatusOption({ value }: { value: string }) {
  // DELETED is a derived soft-delete state (not a JiraStatus): muted rose +
  // strikethrough, matching the badge treatment everywhere else (BRDG-322).
  if (value === "DELETED") {
    return (
      <span
        className="inline-flex items-center rounded px-2 py-0.5 text-body-sm font-medium line-through"
        style={{ backgroundColor: "var(--color-status-deleted-subtle)", color: "var(--color-status-deleted)" }}
      >
        DELETED
      </span>
    );
  }
  return <StatusBadge status={value as JiraStatus} />;
}
