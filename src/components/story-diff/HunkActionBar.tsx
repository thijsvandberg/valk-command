"use client";

import { Check, X, Pencil } from "lucide-react";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export type HunkDecision = "pending" | "accept" | "reject" | "custom";

export interface HunkState {
  decision: HunkDecision;
  customText?: string;
}

export interface InteractiveCallbacks {
  states: Record<number, HunkState>;
  editingHunk: number | null;
  onAccept: (i: number) => void;
  onReject: (i: number) => void;
  onEdit: (i: number) => void;
  onSaveEdit: (i: number, text: string) => void;
  onCancelEdit: () => void;
  onReset: (i: number) => void;
  onAcceptAll: () => void;
}

// -----------------------------------------------------------------------
// Colors
// -----------------------------------------------------------------------

const C = {
  addedGutter: "var(--color-diff-added-gutter)",
  deletedGutter: "var(--color-diff-deleted-gutter)",
  border: "var(--color-border-strong)",
  modifiedBadge: "var(--color-diff-modified-badge)",
} as const;

// -----------------------------------------------------------------------
// Decision styles
// -----------------------------------------------------------------------

export const decisionStyles: Record<HunkDecision, { label: string; color: string; bg: string; borderColor: string }> = {
  pending: { label: "", color: "", bg: "var(--color-overlay-subtle)", borderColor: C.border },
  accept: { label: "Accepted", color: C.addedGutter, bg: "var(--color-diff-accept-bg)", borderColor: "var(--color-diff-accept-border)" },
  reject: { label: "Rejected", color: C.deletedGutter, bg: "var(--color-diff-reject-bg)", borderColor: "var(--color-diff-reject-border)" },
  custom: { label: "Custom edit", color: C.modifiedBadge, bg: "var(--color-diff-accept-bg)", borderColor: "var(--color-diff-accept-border)" },
};

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export function HunkActionBar({
  hunkIndex,
  decision,
  cbs,
}: {
  hunkIndex: number;
  decision: HunkDecision;
  cbs: InteractiveCallbacks;
}) {
  const st = decisionStyles[decision];
  const decided = decision !== "pending";
  const btnBase =
    "flex items-center gap-1 rounded-md px-2.5 py-1 text-label font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div
      className="flex items-center border-y"
      style={{ borderColor: st.borderColor, backgroundColor: st.bg }}
    >
      <div className="flex flex-1 items-center gap-1 px-2 py-1.5">
        {decided ? (
          <>
            <span
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-label font-semibold"
              style={{ color: st.color }}
            >
              {decision === "accept" && <Check size={12} strokeWidth={2.5} />}
              {decision === "reject" && <X size={12} strokeWidth={2.5} />}
              {decision === "custom" && <Pencil size={11} strokeWidth={2} />}
              {st.label}
            </span>
            <button
              type="button"
              onClick={() => cbs.onReset(hunkIndex)}
              className={`${btnBase} text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Clear decision"
            >
              <X size={11} strokeWidth={1.5} />
              Clear
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => cbs.onAccept(hunkIndex)}
              className={`${btnBase} text-text-secondary diff-btn-accept`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Accept new version"
            >
              <Check size={12} strokeWidth={2} />
              Accept
            </button>
            <button
              type="button"
              onClick={() => cbs.onReject(hunkIndex)}
              className={`${btnBase} text-text-secondary diff-btn-reject`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Keep old version"
            >
              <X size={12} strokeWidth={2} />
              Reject
            </button>
            <button
              type="button"
              onClick={() => cbs.onEdit(hunkIndex)}
              className={`${btnBase} text-text-secondary hover:bg-hover-interactive hover:text-text-secondary`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Edit this section"
            >
              <Pencil size={11} strokeWidth={1.5} />
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}
