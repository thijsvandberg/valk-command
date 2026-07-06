"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, FileText, AlignLeft, Sparkles, ChevronDown, ChevronRight, Loader2, Link2, Check, CalendarRange, PenLine } from "lucide-react";
import type { EpicChildCardWithSprint } from "@/types/epic-writer";
import { SprintPlacementMenu } from "./SprintPlacementMenu";

interface ChildStoryCardProps {
  card: EpicChildCardWithSprint;
  // Deepen the card into a full body + AC (detail phase). Omitted when the board
  // is read-only (e.g. no active deepen path available).
  onDeepen?: (index: number, title: string) => void | Promise<unknown>;
  // Persist a PO hand-edit of the worked-out body.
  onEditBody?: (index: number, body: string | null) => void | Promise<unknown>;
  // Promote this DRAFT card to a real Jira issue under the epic with the chosen
  // placement. Omitted on a read-only board.
  onCreateInJira?: (index: number, placement: string) => void | Promise<unknown>;
  // Confirm one AI-proposed inter-story link from this card.
  onConfirmLink?: (sourceIndex: number, targetIndex: number, relation: string) => void | Promise<unknown>;
  // Reassign a created card's sprint (jiraKey, target sprint id or "__backlog__").
  // Only offered once a card is live in Jira. Omitted on a read-only board.
  onReassignSprint?: (jiraKey: string, targetSprintId: string) => void | Promise<unknown>;
  // Open a created child story in-place in the Epic Writer (BRDG-485). Only shown
  // once the card is live in Jira (a DRAFT has no ticket to open yet).
  onOpenChild?: (jiraKey: string) => void;
  // Titles of all cards by cardIndex, so a suggested link can name its target.
  cardTitles?: Record<number, string>;
  // cardIndexes of cards already created in Jira; a link can only be confirmed
  // once both ends are live, so the confirm button stays disabled until then.
  createdIndexes?: Set<number>;
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

function cardDepth(card: EpicChildCardWithSprint): Depth {
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
export function ChildStoryCard({
  card,
  onDeepen,
  onEditBody,
  onCreateInJira,
  onConfirmLink,
  onReassignSprint,
  onOpenChild,
  cardTitles,
  createdIndexes,
  busy,
}: ChildStoryCardProps) {
  const depth = cardDepth(card);
  const meta = DEPTH_META[depth];
  const DepthIcon = meta.icon;
  const bullets = Array.isArray(card.bullets) ? card.bullets : [];
  const hasBody = !!card.body && card.body.trim().length > 0;
  const isCreated = card.status === "created" && !!card.jiraKey;
  const suggestedLinks = Array.isArray(card.suggestedLinks) ? card.suggestedLinks : [];

  const [creating, setCreating] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);

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
    <article className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-3.5 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-caption tabular-nums text-text-muted">
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
            <li key={i} className="flex gap-1.5 text-body-sm leading-body text-text-secondary">
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
                  className="w-full resize-y rounded-md border border-border-default bg-surface-base px-2.5 py-2 text-body-sm leading-body text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
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
                className={`mt-1.5 whitespace-pre-wrap rounded-md bg-overlay-subtle px-2.5 py-2 text-body-sm leading-body text-text-secondary ${onEditBody ? "cursor-text" : ""}`}
              >
                {card.body}
              </div>
            )
          )}
        </div>
      )}

      {suggestedLinks.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {suggestedLinks.map((link, i) => {
            const targetTitle = cardTitles?.[link.targetIndex] ?? `Story ${link.targetIndex + 1}`;
            const targetCreated = createdIndexes?.has(link.targetIndex) ?? false;
            // Both ends must be live in Jira before a link can be created.
            const canConfirm = isCreated && targetCreated && !link.confirmed;
            const linkId = `${link.targetIndex}:${link.relation}`;
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-md bg-overlay-subtle px-2 py-1 text-label text-text-tertiary"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Link2 size={10} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                  <span className="shrink-0 font-medium text-text-secondary">{link.relation}</span>
                  <span className="min-w-0 truncate">{targetTitle}</span>
                </span>
                {link.confirmed ? (
                  <span className="flex shrink-0 items-center gap-0.5 text-[var(--color-brand-400)]">
                    <Check size={10} strokeWidth={2} />
                    Linked
                  </span>
                ) : onConfirmLink ? (
                  <button
                    type="button"
                    disabled={!canConfirm || linkingKey !== null}
                    onClick={async () => {
                      setLinkingKey(linkId);
                      try {
                        await onConfirmLink(card.cardIndex, link.targetIndex, link.relation);
                      } finally {
                        setLinkingKey(null);
                      }
                    }}
                    className="flex shrink-0 items-center gap-1 rounded border border-border-default bg-surface-base px-1.5 py-0.5 font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      canConfirm
                        ? "Create this link in Jira"
                        : "Both stories must be created in Jira first"
                    }
                  >
                    {linkingKey === linkId ? (
                      <Loader2 size={10} strokeWidth={1.75} className="animate-spin" />
                    ) : null}
                    Confirm
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-3 flex items-center justify-between gap-2">
        {isCreated ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-caption text-[var(--color-brand-400)]">
              {card.jiraKey}
            </span>
            {/* Live sprint of the created issue (null id = backlog). Shows the
                current placement so the PO can see and reassign it. */}
            <span
              className="flex min-w-0 items-center gap-1 text-label text-text-muted"
              title={card.liveSprintId ? "Current sprint" : "Not in a sprint"}
            >
              <CalendarRange size={10} strokeWidth={1.75} className="shrink-0" />
              <span className="min-w-0 truncate">
                {card.liveSprintId
                  ? card.liveSprintName ?? card.liveSprintId
                  : "To be planned"}
              </span>
            </span>
          </span>
        ) : (
          <span className="rounded bg-overlay-subtle px-1.5 py-0.5 text-label font-medium uppercase tracking-wide text-text-muted">
            Draft
          </span>
        )}

        <div className="flex items-center gap-1.5">
          {isCreated && onReassignSprint && card.jiraKey && (
            <SprintPlacementMenu
              variant="reassign"
              busy={reassigning}
              currentSprintId={card.liveSprintId}
              onCreate={async (placement) => {
                setReassigning(true);
                try {
                  await onReassignSprint(card.jiraKey as string, placement);
                } finally {
                  setReassigning(false);
                }
              }}
            />
          )}

          {isCreated && card.jiraKey && onOpenChild && (
            <button
              type="button"
              onClick={() => onOpenChild(card.jiraKey as string)}
              className="flex items-center gap-1 rounded-md border border-border-default bg-overlay-subtle px-2 py-0.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
              title="Work this story out in the Epic Writer"
            >
              <PenLine size={11} strokeWidth={1.75} />
              Open
            </button>
          )}

          {onDeepen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDeepen(card.cardIndex, card.title)}
              className="flex items-center gap-1 rounded-md border border-border-default bg-overlay-subtle px-2 py-0.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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

          {onCreateInJira && !isCreated && (
            <SprintPlacementMenu
              busy={creating}
              onCreate={async (placement) => {
                setCreating(true);
                try {
                  await onCreateInJira(card.cardIndex, placement);
                } finally {
                  setCreating(false);
                }
              }}
            />
          )}
        </div>
      </footer>
    </article>
  );
}
