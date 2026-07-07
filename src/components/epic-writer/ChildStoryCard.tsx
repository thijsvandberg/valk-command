"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, FileText, AlignLeft, SendHorizontal, ChevronDown, ChevronRight, Loader2, Link2, Check, PenLine, Plus } from "lucide-react";
import type { EpicChildCardWithSprint } from "@/types/epic-writer";
import { TicketRefPill } from "@/components/shared/TicketRefPill";
import { SprintOrBacklogBadge } from "@/components/shared/IssueMetaBadges";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { SprintPlacementMenu } from "./SprintPlacementMenu";

interface ChildStoryCardProps {
  card: EpicChildCardWithSprint;
  // Deepen the card into a full body + AC (refine phase). Omitted when the board
  // is read-only (e.g. no active deepen path available).
  onDeepen?: (index: number, title: string) => void | Promise<unknown>;
  // Stage the deepen prompt in the chat compose box instead of sending it
  // (BRDG-490 #8), so the PO can tweak it first. Renders the split-button arrow
  // next to Deepen/Improve. Omitted keeps the action send-only.
  onStageDeepen?: (index: number, title: string) => void;
  // Persist a PO hand-edit of the card in place (BRDG-490 #5): any of title,
  // bullets, or body. Only wired for DRAFT cards; created cards edit through the
  // story editor (the Open action), so their title/bullets/body stay read-only
  // here. Omitting it makes the card fully read-only.
  onEditCard?: (
    index: number,
    patch: { title?: string; bullets?: string[]; body?: string | null },
  ) => void | Promise<unknown>;
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
  // Collapsed (BRDG-490 #1): fold the card to its title + status/actions row,
  // hiding bullets, the worked-out body, and suggested links. Each card collapses
  // on its own (per-card chevron); the board's "Collapse all / Expand all" drives
  // every card at once through the same state. Supersedes BRDG-487 #2's board-wide
  // compact boolean.
  collapsed?: boolean;
  // Toggle this card's own collapsed state. When provided, the header shows a
  // per-card collapse chevron. Omitted on a read-only board.
  onToggleCollapse?: () => void;
  // Drag handle (BRDG-487 #10): the board injects a grip bound to its sortable
  // context here, rendered at the start of the header. Omitted when reordering
  // is not available (read-only board).
  dragHandle?: React.ReactNode;
}

/**
 * Depth of a card: title-only (skeleton), bullets (the default detail level), or
 * full (a worked-out body added in the refine phase). It feeds the single status
 * badge (BRDG-490 #2), which folds the old separate DRAFT pill and depth badge
 * into one signal that reads "draft vs created" AND how worked-out the card is.
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
  onStageDeepen,
  onEditCard,
  onCreateInJira,
  onConfirmLink,
  onReassignSprint,
  onOpenChild,
  cardTitles,
  createdIndexes,
  busy,
  collapsed = false,
  onToggleCollapse,
  dragHandle,
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

  // In-place editing (BRDG-490 #5) is offered on DRAFT cards only; created cards
  // round-trip through the story editor (the Open action), so they stay read-only
  // here. The body is always rendered as formatted markdown (BRDG-490 #6).
  const canEdit = !isCreated && !!onEditCard;

  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBullets, setEditingBullets] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  // Each edit buffer is seeded from the card each time editing starts, so the
  // read view always reflects the latest AI/persisted content and edits never
  // clobber a sparring refine that lands while a field is not being edited.
  const [titleDraft, setTitleDraft] = useState("");
  const [bulletsDraft, setBulletsDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const bulletsTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (editingBullets) bulletsTextareaRef.current?.focus();
  }, [editingBullets]);

  const startEditTitle = () => {
    setTitleDraft(card.title);
    setEditingTitle(true);
  };
  const commitTitle = () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    // The title must stay non-empty; an empty edit reverts to the current title.
    if (next.length > 0 && next !== card.title) {
      void onEditCard?.(card.cardIndex, { title: next });
    }
  };

  const startEditBullets = () => {
    setBulletsDraft(bullets.join("\n"));
    setEditingBullets(true);
  };
  const commitBullets = () => {
    setEditingBullets(false);
    const next = bulletsDraft
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
    if (JSON.stringify(next) !== JSON.stringify(bullets)) {
      void onEditCard?.(card.cardIndex, { bullets: next });
    }
  };

  const startEditBody = () => {
    setExpanded(true);
    setBodyDraft(card.body ?? "");
    setEditingBody(true);
  };
  const commitBody = () => {
    setEditingBody(false);
    if ((card.body ?? "") !== bodyDraft) {
      void onEditCard?.(card.cardIndex, { body: bodyDraft.length > 0 ? bodyDraft : null });
    }
  };
  const cancelBody = () => setEditingBody(false);

  return (
    <article className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-3.5 shadow-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {dragHandle}
          <span className="font-mono text-label tabular-nums text-text-muted">
            {card.cardIndex + 1}
          </span>
          {canEdit && editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                } else if (e.key === "Escape") {
                  setEditingTitle(false);
                }
              }}
              className="min-w-0 flex-1 rounded border border-border-default bg-surface-base px-1.5 py-0.5 text-body-lg font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
            />
          ) : (
            <h3
              className={`min-w-0 truncate text-body-lg font-semibold text-text-primary ${
                canEdit ? "cursor-text" : ""
              }`}
              {...(canEdit
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    title: "Click to rename",
                    onClick: startEditTitle,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        startEditTitle();
                      }
                    },
                  }
                : {})}
            >
              {card.title}
            </h3>
          )}
        </div>
        {/* Per-card collapse toggle (BRDG-490 #1): fold this card to its title
            independently of the others. The board's Collapse all / Expand all
            drives the same state for every card. */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand card" : "Collapse card"}
            title={collapsed ? "Expand card" : "Collapse to title"}
            className="-mr-0.5 flex size-5 shrink-0 items-center justify-center rounded text-text-muted cursor-pointer transition-colors duration-150 hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            {collapsed ? (
              <ChevronRight size={13} strokeWidth={2} />
            ) : (
              <ChevronDown size={13} strokeWidth={2} />
            )}
          </button>
        )}
      </header>

      {/* Bullets (BRDG-490 #5): editable in place on DRAFT cards via a plain
          one-per-line textarea (bullets are short strings, not markdown). */}
      {!collapsed && editingBullets ? (
        <div className="mt-2.5">
          <textarea
            ref={bulletsTextareaRef}
            value={bulletsDraft}
            onChange={(e) => setBulletsDraft(e.target.value)}
            onBlur={commitBullets}
            rows={Math.min(10, Math.max(2, bulletsDraft.split("\n").length + 1))}
            placeholder="One bullet per line"
            className="w-full resize-y rounded-md border border-border-default bg-surface-base px-2.5 py-2 text-body leading-body text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
          />
        </div>
      ) : !collapsed && bullets.length > 0 ? (
        <ul className="mt-2.5 space-y-1">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-1.5 text-body leading-body text-text-secondary">
              <span className="mt-[0.5rem] h-1 w-1 shrink-0 rounded-full bg-text-muted" />
              <span className="min-w-0">{bullet}</span>
            </li>
          ))}
          {canEdit && (
            <li>
              <button
                type="button"
                onClick={startEditBullets}
                className="mt-0.5 flex items-center gap-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <PenLine size={11} strokeWidth={1.75} />
                Edit bullets
              </button>
            </li>
          )}
        </ul>
      ) : !collapsed && canEdit ? (
        <button
          type="button"
          onClick={startEditBullets}
          className="mt-2.5 flex items-center gap-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <Plus size={11} strokeWidth={2} />
          Add bullets
        </button>
      ) : null}

      {/* Detail body (BRDG-490 #6): rendered as formatted markdown in the read
          view, and edited in place with the shared story editor (RichEditor) on
          DRAFT cards - not a raw textarea. A draft with no body yet gets an
          "Add detail" affordance. */}
      {!collapsed && editingBody ? (
        <div className="mt-2.5 overflow-hidden rounded-md border border-border-default bg-surface-base">
          <RichEditor
            value={bodyDraft}
            onChange={setBodyDraft}
            borderless
            minHeight={120}
            placeholder="Work out the story description and acceptance criteria…"
          />
          <div className="flex items-center justify-end gap-1.5 border-t border-border-subtle px-2 py-1.5">
            <button
              type="button"
              onClick={cancelBody}
              className="rounded-md px-2 py-0.5 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitBody}
              className="flex items-center gap-1 rounded-md border border-border-default bg-overlay-subtle px-2 py-0.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
            >
              <Check size={11} strokeWidth={2} />
              Save
            </button>
          </div>
        </div>
      ) : !collapsed && hasBody ? (
        <div className="mt-2.5">
          <div className="flex items-center gap-3">
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
            {expanded && canEdit && (
              <button
                type="button"
                onClick={startEditBody}
                className="flex items-center gap-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <PenLine size={11} strokeWidth={1.75} />
                Edit detail
              </button>
            )}
          </div>

          {expanded && (
            <div className="description-content mt-1.5 rounded-md bg-overlay-subtle px-2.5 py-2 text-body leading-body text-text-secondary">
              {renderMarkdown(card.body as string, { linkifyRefs: true })}
            </div>
          )}
        </div>
      ) : !collapsed && canEdit ? (
        <button
          type="button"
          onClick={startEditBody}
          className="mt-2.5 flex items-center gap-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <Plus size={11} strokeWidth={2} />
          Add detail
        </button>
      ) : null}

      {!collapsed && suggestedLinks.length > 0 && (
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
            {/* Standard ticket reference (BRDG-487 #9): the created story's Jira key
                renders as the shared TicketRefPill (issue-type icon + status + hover),
                the same chip used everywhere else a ticket key appears. */}
            <TicketRefPill ticketKey={card.jiraKey as string} />
            {/* Standard sprint representation (BRDG-487 #9): match how the board shows
                a sprint (IterationCw pill) or backlog placement, instead of a bespoke
                badge. Assign or reassign via the Move sprint menu / Sprints view. */}
            <SprintOrBacklogBadge
              sprintName={card.liveSprintId ? card.liveSprintName ?? card.liveSprintId : null}
            />
          </span>
        ) : (
          /* Single status badge (BRDG-490 #2): one signal for a not-yet-created
             card that folds the old separate "Draft" pill and depth badge into
             "Draft" + how worked-out it is ("Draft · Bullets" / "Draft · Full").
             A title-only card stays plain "Draft". */
          <span
            className="flex shrink-0 items-center gap-1 rounded-md bg-overlay-subtle px-1.5 py-0.5 text-label font-medium text-text-tertiary"
            title={
              depth === "title"
                ? "Draft outline - create this story in Jira to schedule it into a sprint"
                : `Draft (worked out to ${meta.label.toLowerCase()}) - create this story in Jira to schedule it into a sprint`
            }
          >
            <DepthIcon size={10} strokeWidth={1.75} />
            {depth === "title" ? "Draft" : `Draft · ${meta.label}`}
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
            // Split action (BRDG-491 #1): one shared model with the chat chips /
            // quick-actions popover - the label stages the prompt in the compose
            // box so the PO can tweak it, the trailing paper-plane arrow sends now.
            // No leading icon. Distinct, non-colliding labels (BRDG-490 #7):
            // "Deepen" fleshes an outline out to a full story; "Improve" adjusts an
            // already-full one (never "Refine", which is a phase name, BRDG-488).
            <div className="group flex items-stretch overflow-hidden rounded-md border border-border-default bg-overlay-subtle">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onStageDeepen
                    ? onStageDeepen(card.cardIndex, card.title)
                    : void onDeepen(card.cardIndex, card.title)
                }
                className="flex items-center gap-1 px-2 py-0.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  onStageDeepen
                    ? hasBody
                      ? "Improve: stage the prompt in chat to edit before sending"
                      : "Deepen: stage the prompt in chat to edit before sending"
                    : hasBody
                      ? "Improve the worked-out story"
                      : "Work this story out into a full description and acceptance criteria"
                }
              >
                {busy && !onStageDeepen && (
                  <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
                )}
                {hasBody ? "Improve" : "Deepen"}
              </button>
              {onStageDeepen && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeepen(card.cardIndex, card.title)}
                  className="flex items-center justify-center border-l border-border-default px-1.5 text-text-muted cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)]/[0.12] hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-40"
                  title="Send now"
                  aria-label={`Send the ${hasBody ? "improve" : "deepen"} prompt now`}
                >
                  {busy ? (
                    <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
                  ) : (
                    <SendHorizontal size={11} strokeWidth={1.75} />
                  )}
                </button>
              )}
            </div>
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
