"use client";

import { LayoutList } from "lucide-react";
import type { EpicChildDraftRow } from "@/db/schema";
import { ChildStoryCard } from "./ChildStoryCard";

interface BreakdownBoardProps {
  cards: EpicChildDraftRow[];
}

/**
 * The right-hand board of the Epic Writer: the AI-proposed child-story cards.
 * In the breakdown/refine phases the PO spars in chat ("split card 3", "add a
 * story for X") and the board reflects the latest <epic-breakdown>. Create-in-
 * Jira, deepen, and link affordances are added in later stories.
 */
export function BreakdownBoard({ cards }: BreakdownBoardProps) {
  if (cards.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <LayoutList size={20} strokeWidth={1.5} className="text-text-muted" />
        <p className="text-body-sm text-text-tertiary">No breakdown yet.</p>
        <p className="max-w-[28ch] text-label text-text-muted">
          Spar in chat to have the AI propose child stories. The breakdown appears here.
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
          <ChildStoryCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
