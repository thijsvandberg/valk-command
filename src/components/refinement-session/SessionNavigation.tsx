"use client";

import { useState, useCallback, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import {
  ChevronLeft,
  ChevronRight,
  List,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SessionQueueItem } from "./SessionQueueItem";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { HoverDataProvider } from "@/hooks/useTicketHoverData";
import type { Ticket } from "@/types/ticket";

export interface SessionNavigationProps {
  currentIndex: number;
  queue: string[];
  queueMeta: Array<{ key: string; title: string }>;
  allTickets: Ticket[] | undefined;
  isLastTicket: boolean;
  storyPoints: number | null;
  onStoryPointsChange: (value: number | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onGoToTicket: (idx: number) => void;
  onReorderQueue: (fromIdx: number, toIdx: number) => void;
}

export function SessionNavigation({
  currentIndex,
  queue,
  queueMeta,
  allTickets,
  isLastTicket,
  storyPoints,
  onStoryPointsChange,
  onPrev,
  onNext,
  onGoToTicket,
  onReorderQueue,
}: SessionNavigationProps) {
  const [navDropdownOpen, setNavDropdownOpen] = useState(false);
  const navDropdownRef = useRef<HTMLDivElement>(null);
  // Anchor the fixed dropdown just below the trigger. Measured in the toggle
  // handler (an event, not render) to avoid reading the ref during render.
  const [dropdownTop, setDropdownTop] = useState(48);

  const toggleNavDropdown = useCallback(() => {
    if (!navDropdownOpen) {
      const rect = navDropdownRef.current?.getBoundingClientRect();
      if (rect) setDropdownTop(rect.bottom + 8);
    }
    setNavDropdownOpen((open) => !open);
  }, [navDropdownOpen]);

  const queueSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleQueueDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = queue.indexOf(active.id as string);
    const toIdx = queue.indexOf(over.id as string);
    if (fromIdx === -1 || toIdx === -1) return;
    onReorderQueue(fromIdx, toIdx);
  }, [queue, onReorderQueue]);

  useOutsideClick(navDropdownRef, () => setNavDropdownOpen(false), { enabled: navDropdownOpen });

  return (
    <div className="relative flex items-center gap-3">
      <span className="text-body-sm font-medium tabular-nums text-text-secondary">
        Ticket {currentIndex + 1} of {queue.length}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="flex cursor-pointer items-center justify-center rounded-md p-1 text-text-muted hover:bg-overlay-subtle hover:text-text-secondary disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease" }}
        aria-label="Previous ticket"
      >
        <ChevronLeft size={14} strokeWidth={2} />
      </button>
      <div className="hidden items-center gap-1.5 min-[1400px]:flex">
        {queue.map((key, idx) => (
          <button
            key={key}
            type="button"
            onClick={() => onGoToTicket(idx)}
            className="group relative cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            aria-label={`Go to ticket ${idx + 1}: ${key}`}
          >
            <div
              className={`h-1.5 rounded-full ${
                idx === currentIndex
                  ? "w-8 bg-[var(--color-brand-500)]"
                  : idx < currentIndex
                    ? "w-4 bg-[var(--color-brand-500)]/40"
                    : "w-4 bg-overlay-strong"
              }`}
              style={{ transition: "width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease" }}
            />
          </button>
        ))}
      </div>
      <StoryPointPicker
        value={storyPoints}
        onChange={onStoryPointsChange}
        align="left"
        size="lg"
        showMetricIcon
        richTooltip
      />
      <button
        type="button"
        onClick={onNext}
        className={`flex cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          storyPoints != null
            ? "gap-1 bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)] active:bg-[var(--color-brand-700)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{
          padding: storyPoints != null ? "4px 10px" : "4px",
          transition: "background-color 0.25s ease, color 0.25s ease, padding 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease",
          boxShadow: storyPoints != null ? "0 2px 8px color-mix(in srgb, var(--color-brand-500) 30%, transparent)" : "none",
        }}
        aria-label={isLastTicket ? "End session" : "Next ticket"}
      >
        <span
          className="overflow-hidden text-body-sm font-medium whitespace-nowrap"
          style={{
            maxWidth: storyPoints != null ? "60px" : "0px",
            opacity: storyPoints != null ? 1 : 0,
            transition: "max-width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
          }}
        >
          {isLastTicket ? "Finish" : "Next"}
        </span>
        <ChevronRight size={14} strokeWidth={2} />
      </button>
      {/* Navigation dropdown trigger */}
      <div className="relative" ref={navDropdownRef}>
        <button
          type="button"
          onClick={toggleNavDropdown}
          className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
            navDropdownOpen
              ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
              : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
          }`}
          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
          title="Jump to ticket"
        >
          <List size={14} strokeWidth={1.5} />
        </button>
        {navDropdownOpen && (
          <div
            className="fixed left-1/2 z-50 w-[520px] min-[1200px]:w-[680px] -translate-x-1/2 rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
            style={{ animation: "fadeInUp 0.1s ease", top: dropdownTop }}
          >
            <div className="px-3 py-2 text-label font-semibold uppercase tracking-wider text-text-muted">
              Queue
            </div>
            <div className="max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {/* Batch the queue's hover-card data in one bounded fetch (BRDG-412)
                  so each queue item resolves its tooltip without the whole backlog. */}
              <HoverDataProvider keys={queue}>
                <DndContext sensors={queueSensors} collisionDetection={closestCenter} onDragEnd={handleQueueDragEnd}>
                  <SortableContext items={queue} strategy={verticalListSortingStrategy}>
                    {queue.map((key, idx) => {
                      const meta = queueMeta.find((m) => m.key === key);
                      const t = allTickets?.find((ticket) => ticket.key === key);
                      return (
                        <SessionQueueItem
                          key={key}
                          ticketKey={key}
                          title={meta?.title ?? key}
                          isCurrent={idx === currentIndex}
                          isRefined={idx < currentIndex}
                          issueType={t?.type}
                          jiraStatus={t?.jiraStatus}
                          onClick={() => { onGoToTicket(idx); setNavDropdownOpen(false); }}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </HoverDataProvider>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
