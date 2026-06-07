"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, FileText, AlignLeft, Sparkles, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { EpicChildDraftRow } from "@/db/schema";

interface ChildStoryCardProps {
  card: EpicChildDraftRow;
  // Deepen the card into a full body + AC (detail phase). Omitted when the board
  // is read-only (e.g. no active deepen path available).
  onDeepen?: (index: number, title: string) => void | Promise<unknown>;
  // Persist a PO hand-edit of the worked-out body.
  onEditBody?: (index: number, body: string | null) => void | Promise<unknown>;
  // True while a workspace task is running, so the card disables its deepen
  // action (one turn at a time) and shows a busy affordance.
  busy?: boolean;
}

/**
 * Depth of a card drives the badge: title-only (skeleton), bullets (the default
 * detail level), or full (a worked-out body added in the detail phase). The
 * badge tells the PO at a glance how far a story has been taken.
 */
type Depth = "title" | "bullets" | "full";

function cardDepth(card: EpicChildDraftRow): Depth {
  if (card.body && card.body.trim().length > 0) return "full";
  if (Array.isArray(card.bullets) && card.bullets.length > 0) return "bullets";
  return "title";
}

const DEPTH_META: Record<Depth, { label: string; icon: typeof Layers }> = {
  title: { label: "Title", icon: FileText },
  bullets: { label: "Bullets", icon: AlignLeft },
  full: { label: "Full", icon: Layers },
};

/**
 * A single child-story card on the breakdown board. Renders the title, bullet
 * list, and a depth badge. A "Deepen" action works the card out into a full body
 * + AC; once filled, the body is shown in an expandable, editable region. DRAFT
 * cards show the local state; created cards show their Jira key.
 */
export function ChildStoryCard({ card, onDeepen, onEditBody, busy }: ChildStoryCardProps) {
  const depth = cardDepth(card);
  const meta = DEPTH_META[depth];
  const DepthIcon = meta.icon;
  const bullets = Array.isArray(card.bullets) ? card.bullets : [];
  const hasBody = !!card.body && card.body.trim().length > 0;

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  // The edit buffer is seeded from the card body each time editing starts (see
  // startEdit), so the read view always reflects the latest AI/persisted body
  // and edits never clobber a sparring refine that lands while collapsed.
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setExpanded(true);
    setDraft(card.body ?? "");
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    if ((card.body ?? "") !== draft) {
      void onEditBody?.(card.cardIndex, draft.length > 0 ? draft : null);
    }
  };

  return (
    <article className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-text-muted">
            {card.cardIndex + 1}
          </span>
          <h3 className="min-w-0 truncate text-body-sm font-semibold text-text-primary">
            {card.title}
          </h3>
        </div>
        <span
          className="flex shrink-0 items-center gap-1 rounded-md bg-overlay-default px-1.5 py-0.5 text-label font-medium text-text-tertiary"
          title={`Depth: ${meta.label}`}
        >
          <DepthIcon size={10} strokeWidth={1.75} />
          {meta.label}
        </span>
      </header>

      {bullets.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-1.5 text-body-sm leading-[1.6] text-text-secondary">
              <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-text-muted" />
              <span className="min-w-0">{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {hasBody && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown size={11} strokeWidth={2} />
            ) : (
              <ChevronRight size={11} strokeWidth={2} />
            )}
            {expanded ? "Hide detail" : "Show detail"}
          </button>

          {expanded && (
            editing ? (
              <div className="mt-1.5">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  rows={Math.min(16, Math.max(4, draft.split("\n").length + 1))}
                  className="w-full resize-y rounded-md border border-border-default bg-surface-base px-2.5 py-2 text-body-sm leading-[1.6] text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                />
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => onEditBody && startEdit()}
                onKeyDown={(e) => {
                  if (onEditBody && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    startEdit();
                  }
                }}
                title={onEditBody ? "Click to edit" : undefined}
                className={`mt-1.5 whitespace-pre-wrap rounded-md bg-overlay-subtle px-2.5 py-2 text-body-sm leading-[1.6] text-text-secondary ${onEditBody ? "cursor-text" : ""}`}
              >
                {card.body}
              </div>
            )
          )}
        </div>
      )}

      <footer className="mt-3 flex items-center justify-between gap-2">
        {card.status === "created" && card.jiraKey ? (
          <span className="font-mono text-[10px] text-[var(--color-brand-400)]">
            {card.jiraKey}
          </span>
        ) : (
          <span className="rounded bg-overlay-subtle px-1.5 py-0.5 text-label font-medium uppercase tracking-wide text-text-muted">
            Draft
          </span>
        )}

        {onDeepen && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDeepen(card.cardIndex, card.title)}
            className="flex items-center gap-1 rounded-md border border-border-default bg-overlay-subtle px-2 py-0.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            title={hasBody ? "Refine the worked-out story" : "Work this story out in full"}
          >
            {busy ? (
              <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
            ) : (
              <Sparkles size={11} strokeWidth={1.75} />
            )}
            {hasBody ? "Refine" : "Deepen"}
          </button>
        )}
      </footer>
    </article>
  );
}
