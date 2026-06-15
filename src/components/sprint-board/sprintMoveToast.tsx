import type { ReactNode } from "react";

// Shared success toast for a sprint move, so drag-and-drop, right-click and bulk
// moves all read identically ("Moved N ticket(s) to <dest> · View on sprint board")
// instead of each rolling its own message. `onView` should navigate to the
// destination and dismiss the toast.
export function sprintMoveToastContent({
  count,
  destName,
  isBacklog,
  onView,
}: {
  count: number;
  destName: string;
  isBacklog: boolean;
  onView: () => void;
}): ReactNode {
  return (
    <span>
      Moved {count} ticket{count === 1 ? "" : "s"} to{" "}
      <span className="font-semibold text-text-primary">{destName}</span>
      <span className="mx-2 text-text-muted" aria-hidden>&middot;</span>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onView();
        }}
        className="font-medium text-[var(--color-brand-400)] underline underline-offset-2 hover:text-[var(--color-brand-300)]"
      >
        {isBacklog ? "View in backlog" : "View on sprint board"}
      </a>
    </span>
  );
}
