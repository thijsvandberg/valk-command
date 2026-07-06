"use client";

import { LayoutList, Loader2, Sparkles } from "lucide-react";
import type { EpicChildCardWithSprint } from "@/types/epic-writer";
import { Button } from "@/components/ui/Button";
import { ChildStoryCard } from "./ChildStoryCard";

interface BreakdownBoardProps {
  cards: EpicChildCardWithSprint[];
  // Deepen a card into a full body + AC (detail phase).
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
  // True while a workspace task is running: cards disable their deepen action.
  busy?: boolean;
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
  busy,
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
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-brand-500)]/[0.12] bg-[var(--color-brand-500)]/[0.08]">
          <LayoutList size={20} strokeWidth={1.5} className="text-[var(--color-brand-400)] opacity-70" />
        </div>
        <div className="space-y-1">
          <p className="text-body-sm font-semibold text-text-secondary">No breakdown yet</p>
          <p className="max-w-[30ch] text-label leading-relaxed text-text-muted">
            Turn this epic into child stories. You can refine, split, and add stories afterwards.
          </p>
        </div>
        {onGenerateBreakdown && (
          <Button
            variant="primary"
            size="md"
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
        <p className="max-w-[30ch] text-caption text-text-muted/80">
          Or ask in chat, e.g. &ldquo;split this into stories&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2.5">
        <span className="text-body-sm font-semibold text-text-secondary">Breakdown</span>
        <span className="text-label text-text-muted">{cards.length} stories</span>
      </header>
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
            cardTitles={cardTitles}
            createdIndexes={createdIndexes}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}
