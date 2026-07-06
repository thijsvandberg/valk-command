"use client";

import { useCallback, useState } from "react";
import { LayoutList, Loader2, Sparkles, Link2, GripVertical, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  // Persist a manual drag-reorder of the cards (BRDG-487 #10). Receives the card
  // ids in their new top-to-bottom order. Omitted makes the board non-reorderable.
  onReorder?: (orderedIds: string[]) => void | Promise<unknown>;
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
  onReorder,
  busy,
  hideHeader,
}: BreakdownBoardProps) {
  // Per-card collapse (BRDG-490 #1), session-scoped: a set of collapsed card ids.
  // The header's Collapse all / Expand all writes every card at once; each card's
  // chevron toggles its own membership. Supersedes BRDG-487 #2's persisted
  // board-wide compact boolean - collapse is now per-card and not remembered
  // across reloads (the board's cards are AI-regenerated, so a stored per-card
  // choice would rarely still apply).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const allCollapsed = cards.length > 0 && cards.every((c) => collapsedIds.has(c.id));
  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setCollapsedIds(allCollapsed ? new Set() : new Set(cards.map((c) => c.id)));
  }, [allCollapsed, cards]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const ids = cards.map((c) => c.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    void onReorder(arrayMove(ids, oldIndex, newIndex));
  };
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
            {/* Collapse all / Expand all (BRDG-490 #1): the board-wide master for
                the per-card collapse. Collapses every card to its title, or expands
                them all back. Individual cards can still be toggled on their own. */}
            <button
              type="button"
              onClick={toggleAll}
              aria-pressed={allCollapsed}
              className="flex items-center gap-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              title={allCollapsed ? "Expand every card to show bullets and detail" : "Collapse every card to titles only"}
            >
              {allCollapsed ? (
                <ChevronsUpDown size={11} strokeWidth={1.75} />
              ) : (
                <ChevronsDownUp size={11} strokeWidth={1.75} />
              )}
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
            <span className="text-label text-text-muted">{cards.length} stories</span>
          </span>
        </header>
      )}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2.5">
              {cards.map((card) => (
                <SortableChildCard
                  key={card.id}
                  card={card}
                  reorderable={!!onReorder}
                  onDeepen={onDeepen}
                  onEditBody={onEditBody}
                  onCreateInJira={onCreateInJira}
                  onConfirmLink={onConfirmLink}
                  onReassignSprint={onReassignSprint}
                  onOpenChild={onOpenChild}
                  cardTitles={cardTitles}
                  createdIndexes={createdIndexes}
                  busy={busy}
                  collapsed={collapsedIds.has(card.id)}
                  onToggleCollapse={() => toggleCollapse(card.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

/**
 * One sortable row on the breakdown board (BRDG-487 #10). The whole card is the
 * sortable node, but only the grip handle carries the drag listeners, so the
 * card's own buttons/textarea stay clickable. When the board is not reorderable
 * the grip is omitted and the card renders exactly as before.
 */
function SortableChildCard({
  card,
  reorderable,
  ...cardProps
}: { card: EpicChildCardWithSprint; reorderable: boolean } & Omit<
  React.ComponentProps<typeof ChildStoryCard>,
  "card" | "dragHandle"
>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !reorderable,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ChildStoryCard
        card={card}
        {...cardProps}
        dragHandle={
          reorderable ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              tabIndex={-1}
              aria-label="Drag to reorder"
              className="-ml-1 shrink-0 text-text-muted cursor-grab active:cursor-grabbing touch-none transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <GripVertical size={13} strokeWidth={1.5} />
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
