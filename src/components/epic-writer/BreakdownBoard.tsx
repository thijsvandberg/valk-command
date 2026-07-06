"use client";

import { LayoutList, Loader2, Sparkles, Link2 } from "lucide-react";
import type { EpicChildCardWithSprint } from "@/types/epic-writer";
import { Button } from "@/components/ui/Button";
import { ChildStoryCard } from "./ChildStoryCard";

interface BreakdownBoardProps {
  cards: EpicChildCardWithSprint[];
  // Deepen a card into a full body + AC (refine phase).
  onDeepen?: (index: number, title: string) => void | Promise<unknown>;
  // Persist a PO hand-edit of a card's worked-out body.
  onEditBody?: (index: number, body: string | null) => void | Promise<unknown>;
  // Promote a DRAFT card to a real Jira issue under the epic.
  onCreateInJira?: (index: number, placement: string) => void | Promise<unknown>;
  // Confirm one AI-proposed inter-story link.
  onConfirmLink?: (sourceIndex: number, targetIndex: number, relation: string) => void | Promise<unknown>;
  // Reassign a created card's sprint after the fact.
  onReassignSprint?: (jiraKey: string, targetSprintId: string) => void | Promise<unknown>;
  // Ask the AI to produce the first breakdown (empty-board primary action).
  onGenerateBreakdown?: () => void | Promise<unknown>;
  // Open a created child story in-place in the Epic Writer (BRDG-485).
  onOpenChild?: (jiraKey: string) => void;
  // Open the "link existing story" picker to re-parent existing stories (BRDG-487).
  onLinkExisting?: () => void;
  // True while a workspace task is running: cards disable their deepen action.
  busy?: boolean;
  // When the surrounding region owns the header (BRDG-484 mode toggle), drop the
  // internal "Breakdown / N stories" bar so there is no double header.
  hideHeader?: boolean;
}

/**
 * The right-hand board of the Epic Writer: the AI-proposed child-story cards.
 * In the breakdown/refine phases the PO spars in chat ("split card 3", "add a
 * story for X") and the board reflects the latest <epic-breakdown>. Create-in-
 * Jira, deepen, and link affordances are added in later stories.
 */
export function BreakdownBoard({
  cards,
  onDeepen,
  onEditBody,
  onCreateInJira,
  onConfirmLink,
  onReassignSprint,
  onGenerateBreakdown,
  onOpenChild,
  onLinkExisting,
  busy,
  hideHeader,
}: BreakdownBoardProps) {
  // Titles + created-state lookups so each card can name its suggested-link
  // targets and only allow a link once both ends are live in Jira.
  const cardTitles: Record<number, string> = {};
  const createdIndexes = new Set<number>();
  for (const c of cards) {
    cardTitles[c.cardIndex] = c.title;
    if (c.status === "created" && c.jiraKey) createdIndexes.add(c.cardIndex);
  }

  if (cards.length === 0) {
    // Compact, top-aligned prompt (BRDG-484): the empty state is the contextual
    // "next action" for the breakdown phase, not a hero that fills the pane.
    return (
      <div className="flex h-full flex-col items-center gap-2.5 px-5 pt-8 text-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-brand-500)]/[0.12] bg-[var(--color-brand-500)]/[0.08]">
          <LayoutList size={15} strokeWidth={1.5} className="text-[var(--color-brand-400)] opacity-70" />
        </div>
        <p className="max-w-[32ch] text-label leading-relaxed text-text-muted">
          Turn this epic into child stories, then refine, split, and add more.
        </p>
        {onGenerateBreakdown && (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            icon={
              busy
                ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                : <Sparkles size={13} strokeWidth={1.5} />
            }
            onClick={() => void onGenerateBreakdown()}
          >
            {busy ? "Generating breakdown…" : "Generate breakdown"}
          </Button>
        )}
        <p className="text-caption text-text-muted/80">
          or ask in chat, e.g. &ldquo;split this into stories&rdquo;.
        </p>
        {onLinkExisting && (
          <button
            type="button"
            onClick={onLinkExisting}
            className="mt-1 flex items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2.5 py-1 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
          >
            <Link2 size={12} strokeWidth={1.75} />
            Link existing story
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <span className="text-body-sm font-semibold text-text-secondary">Breakdown</span>
          <span className="flex items-center gap-3">
            {onLinkExisting && (
              <button
                type="button"
                onClick={onLinkExisting}
                className="flex items-center gap-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                title="Link an existing story into this epic"
              >
                <Link2 size={11} strokeWidth={1.75} />
                Link existing
              </button>
            )}
            <span className="text-label text-text-muted">{cards.length} stories</span>
          </span>
        </header>
      )}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {cards.map((card) => (
          <ChildStoryCard
            key={card.id}
            card={card}
            onDeepen={onDeepen}
            onEditBody={onEditBody}
            onCreateInJira={onCreateInJira}
            onConfirmLink={onConfirmLink}
            onReassignSprint={onReassignSprint}
            onOpenChild={onOpenChild}
            cardTitles={cardTitles}
            createdIndexes={createdIndexes}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}
