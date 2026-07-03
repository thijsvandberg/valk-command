"use client";

import { FileCheck2, FileX2 } from "lucide-react";

export type TestDocMarkerState = "accepted" | "draft" | "not_needed" | null;

/**
 * Board-row test-doc state marker (BRDG-426): the icon shows the state at a
 * glance; clicking it opens the regular centered review modal (view, edit,
 * regenerate, mark not-needed). A plain button — no hover card — so the doc
 * always opens centered and never clips against the viewport (PO feedback).
 */
export function TestDocMarker({
  state,
  onOpenReview,
}: {
  state: TestDocMarkerState;
  onOpenReview?: () => void;
}) {
  const title =
    state === "accepted"
      ? "Test documentation saved — click to view/edit"
      : state === "draft"
        ? "Test doc generated, not yet reviewed — click to review"
        : state === "not_needed"
          ? "Marked: no test documentation needed — click to revisit"
          : "No test documentation yet — click to open the review (generate from there)";

  const icon =
    state === "not_needed" ? (
      <FileX2 size={14} strokeWidth={1.75} className="text-text-muted" />
    ) : (
      <FileCheck2
        size={14}
        strokeWidth={1.75}
        className={
          state === "accepted"
            ? "text-[var(--color-status-success)]"
            : state === "draft"
              ? "text-[var(--color-status-warning)]"
              : "text-text-muted opacity-40"
        }
      />
    );

  if (!onOpenReview) {
    return (
      <span data-testid={`test-doc-state-${state ?? "none"}`} title={title} className="inline-flex shrink-0">
        {icon}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid={`test-doc-state-${state ?? "none"}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onOpenReview();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="grid h-6 w-6 -my-0.5 shrink-0 cursor-pointer place-items-center rounded-md outline-none transition-colors duration-150 hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
    >
      {icon}
    </button>
  );
}
