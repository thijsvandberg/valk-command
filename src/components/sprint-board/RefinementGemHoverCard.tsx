"use client";

import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Boxes, X, ArrowRight } from "lucide-react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { TicketSessionEntry } from "@/hooks/useTicketSessionMap";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Button } from "@/components/ui/Button";
import type { IssueType, JiraStatus, TicketReadiness } from "@/types/ticket";
import { pluralize } from "@/lib/pluralize";

// Past this many members we cap the visible rows and surface a "+N more" link
// to the session, rather than silently truncating the list.
const MAX_VISIBLE_ROWS = 8;

const CARD_WIDTH = 480;

/** Just enough of a sibling ticket to paint the list-variant pill, from already-loaded board data. */
export interface RefinementCardTicketInfo {
  title: string;
  type: IssueType;
  jiraStatus: JiraStatus;
  readiness: TicketReadiness | null;
}

interface CardActions {
  /** The ticket whose gem opened the card (highlighted in each section). */
  currentKey: string;
  /** Resolve sibling ticket detail from already-loaded board data (key-only fallback). */
  ticketInfoMap?: Map<string, RefinementCardTicketInfo>;
  /** Remove a ticket from a session (optimistic PATCH lives in the parent). */
  onRemoveFromRefinement?: (sessionId: string, ticketKey: string) => void;
  /** Navigate to a refinement session (client-side router lives in the parent). */
  onViewRefinement?: (sessionId: string) => void;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function SessionSection({
  session,
  currentKey,
  ticketInfoMap,
  onRemoveFromRefinement,
  onViewRefinement,
}: { session: TicketSessionEntry } & CardActions) {
  const count = session.ticketCount ?? session.ticketKeys.length;
  const visible = session.ticketKeys.slice(0, MAX_VISIBLE_ROWS);
  const overflow = session.ticketKeys.length - visible.length;
  const href = `/refinement/${session.id}`;

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Boxes size={13} strokeWidth={1.5} className="shrink-0" style={{ color: "var(--meta-refine-fg)" }} />
        <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-primary">{session.name}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-text-muted">{count} {pluralize(count, "item")}</span>
      </div>

      <ul className="max-h-[260px] overflow-y-auto pb-1">
        {visible.map((key) => {
          const current = key === currentKey;
          const info = ticketInfoMap?.get(key);
          return (
            <li
              key={key}
              className={`group/refrow flex items-center gap-2 px-3 py-1.5 ${current ? "bg-[var(--color-brand-500)]/[0.06]" : "hover:bg-overlay-subtle"} [transition:background-color_.15s_ease]`}
            >
              <span className="shrink-0" onPointerDown={stop} onClick={stop}>
                <TicketStatusPill
                  ticketKey={key}
                  jiraStatus={info?.jiraStatus ?? "TO DO"}
                  issueType={info?.type}
                  title={info?.title}
                  readiness={info?.readiness ?? null}
                  variant="list"
                  size="sm"
                  showStatus={!!info}
                  showReadiness={!!info}
                />
              </span>
              {info?.title && (
                <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">{info.title}</span>
              )}
              {onRemoveFromRefinement && (
                <button
                  type="button"
                  onPointerDown={stop}
                  onClick={(e) => {
                    stop(e);
                    onRemoveFromRefinement(session.id, key);
                  }}
                  aria-label={`Remove ${key} from ${session.name}`}
                  className="ml-auto shrink-0 cursor-pointer rounded p-0.5 text-text-muted opacity-0 hover:bg-overlay-strong hover:text-rose-400 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] group-hover/refrow:opacity-100 [transition:opacity_.12s_ease,color_.12s_ease,background-color_.12s_ease]"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          );
        })}

        {overflow > 0 && (
          <li className="px-3 pt-0.5">
            <a
              href={href}
              onPointerDown={stop}
              onClick={(e) => {
                stop(e);
                if (onViewRefinement) {
                  e.preventDefault();
                  onViewRefinement(session.id);
                }
              }}
              className="cursor-pointer text-[11px] font-medium text-[var(--color-brand-300)] hover:text-[var(--color-brand-200)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] [transition:color_.15s_ease]"
            >
              +{overflow} more in this refinement
            </a>
          </li>
        )}
      </ul>

      <div className="flex items-center justify-end px-2 py-2">
        <Button
          variant="secondary"
          size="sm"
          onPointerDown={stop}
          onClick={(e) => {
            stop(e);
            onViewRefinement?.(session.id);
          }}
        >
          View refinement
          <ArrowRight size={13} />
        </Button>
      </div>
    </div>
  );
}

interface HoverCardProps extends CardActions {
  sessions: TicketSessionEntry[];
  triggerRef: { current: HTMLElement | null };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
}

function HoverCard({
  sessions,
  triggerRef,
  onMouseEnter,
  onMouseLeave,
  onClose,
  ...actions
}: HoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const [shown, setShown] = useState(false);

  useOutsideClick([cardRef, triggerRef], onClose);

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 280;
    // Right-align the card to the trigger so a card wider than the gem stays on screen.
    const left = Math.max(8, Math.min(rect.right - CARD_WIDTH, window.innerWidth - CARD_WIDTH - 8));
    setPos({ left, top: openUp ? rect.top - 6 : rect.bottom + 6, openUp });
  }, [triggerRef]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Close on scroll, but only the page scroll: the card's internal list scroll
  // does not bubble to window, so it won't dismiss the card.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.addEventListener("scroll", onClose, { capture: true, passive: true });
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onClose, { capture: true });
    };
  }, [onClose]);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={stop}
      onClick={stop}
      className="fixed z-[9999] overflow-hidden rounded-xl border border-border-strong bg-[var(--color-surface-floating)] text-left normal-case tracking-normal shadow-[var(--shadow-popover)] [transition:opacity_.15s_ease,transform_.15s_ease]"
      style={{
        width: CARD_WIDTH,
        left: pos.left,
        ...(pos.openUp ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : `translateY(${pos.openUp ? "4px" : "-4px"})`,
      }}
    >
      {sessions.map((session) => (
        <SessionSection key={session.id} session={session} {...actions} />
      ))}
    </div>,
    document.body,
  );
}

interface RefinementGemTriggerProps extends CardActions {
  sessions: TicketSessionEntry[];
  /** The existing gem markup (kept distinct per row variant). */
  children: ReactNode;
}

/**
 * Wraps the sprint-board gem indicator so hovering or focusing it opens a rich
 * refinement card (BRDG-265) in place of the old plain tooltip. Hover-bridge:
 * the card stays open while the pointer is over the gem OR the card itself.
 */
export function RefinementGemTrigger({
  sessions,
  children,
  ...actions
}: RefinementGemTriggerProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpen = () => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; } };
  const clearClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };

  const scheduleClose = useCallback(() => {
    clearClose();
    closeTimer.current = setTimeout(() => setVisible(false), 250);
  }, []);

  const handleEnter = useCallback(() => {
    clearClose();
    if (visible) return;
    clearOpen();
    openTimer.current = setTimeout(() => setVisible(true), 300);
  }, [visible]);

  const handleLeave = useCallback(() => {
    clearOpen();
    scheduleClose();
  }, [scheduleClose]);

  const close = useCallback(() => {
    clearOpen();
    clearClose();
    setVisible(false);
  }, []);

  useEffect(() => () => { clearOpen(); clearClose(); }, []);

  return (
    <span
      ref={wrapperRef}
      tabIndex={0}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onPointerDown={stop}
      onClick={stop}
      className="inline-flex shrink-0 rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      {children}
      {visible && sessions.length > 0 && (
        <HoverCard
          sessions={sessions}
          triggerRef={wrapperRef}
          onMouseEnter={clearClose}
          onMouseLeave={scheduleClose}
          onClose={close}
          {...actions}
        />
      )}
    </span>
  );
}
