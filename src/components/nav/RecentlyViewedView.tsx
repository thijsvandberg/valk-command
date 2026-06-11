"use client";

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, History, Eraser } from "lucide-react";
import { tickets, swrFetcher } from "@/lib/api-client";
import { buildTicketHoverData } from "@/hooks/useTicketHoverData";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { clearRecentlyViewed, type RecentlyViewedEntry } from "@/lib/recently-viewed-store";
import { revealStyle } from "@/components/nav/revealStyle";
import type { TicketDetailResponse } from "@/lib/ticket-detail-builder";

function agoLabel(viewedAt: number): string {
  const s = Math.max(0, Math.round((Date.now() - viewedAt) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type Bucket = "Today" | "Yesterday" | "Earlier";

function bucketOf(viewedAt: number): Bucket {
  const now = Date.now();
  const day = new Date(viewedAt).toDateString();
  if (day === new Date(now).toDateString()) return "Today";
  if (day === new Date(now - 24 * 60 * 60 * 1000).toDateString()) return "Yesterday";
  return "Earlier";
}

function CurrentDot() {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0" aria-label="Currently open">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-brand-400)] opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
    </span>
  );
}

/**
 * One MRU row: the loose pill segments (issue type, key, status — the same
 * `variant="list"` anatomy as the epic child-issues table, so the key keeps
 * its copy/share dropdown from BRDG-327), then the title, freshness and an
 * "open now" pulse. The pill segment swallows its own clicks; everywhere else
 * the row navigates.
 */
function RecentRow({
  entry,
  isCurrent,
  index,
  open,
  onOpen,
}: {
  entry: RecentlyViewedEntry;
  isCurrent: boolean;
  index: number;
  open: boolean;
  onOpen: (key: string) => void;
}) {
  // Same deferred per-key fetch as TicketRefPill: the stored key + title paint
  // immediately, the live type/status/hover-card fill in right after.
  const { data } = useSWR<TicketDetailResponse>(
    tickets.detailUrl(entry.key),
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000, shouldRetryOnError: false },
  );

  const { sprints } = useJiraSprints();
  const sprintNames = useMemo(() => {
    const m: Record<string, string> = {};
    sprints.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [sprints]);
  const hoverData = data ? buildTicketHoverData(data, sprintNames) : undefined;

  const title = data?.title ?? entry.title ?? "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(entry.key);
        }
      }}
      style={revealStyle(open, 2 + index)}
      className="group flex w-full items-center gap-2 border-t border-border-subtle py-2 pl-1 pr-0.5 text-left transition-colors duration-150 cursor-pointer first:border-t-0 hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      <span className="relative flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
        <TicketStatusPill
          ticketKey={entry.key}
          jiraStatus={data?.jiraStatus ?? "TO DO"}
          issueType={data?.type}
          title={title || undefined}
          variant="list"
          size="sm"
          showReadiness={false}
          showStatus={!!data}
          hoverData={hoverData}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary transition-colors group-hover:text-text-primary">
        {title}
      </span>
      {isCurrent ? (
        <CurrentDot />
      ) : (
        <span className="shrink-0 font-mono text-[10px] text-text-muted/70">{agoLabel(entry.viewedAt)}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
    </div>
  );
}

const BUCKETS: Bucket[] = ["Today", "Yesterday", "Earlier"];

export function RecentlyViewedView({
  open,
  onBack,
  onClose,
}: {
  open: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const entries = useRecentlyViewed();

  function openTicket(key: string) {
    router.push(`/tickets/${key}`);
    onClose();
  }

  return (
    <div data-testid="recently-viewed-view">
      <button
        type="button"
        onClick={onBack}
        style={revealStyle(open, 1)}
        className="group flex w-full items-center gap-2 rounded-xl px-1.5 py-2 text-left transition-colors duration-150 cursor-pointer hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <ChevronLeft className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.5} />
        <History className="h-[18px] w-[18px] shrink-0 text-text-tertiary" strokeWidth={1.5} />
        <span className="text-body-sm font-medium text-text-primary">Recently viewed</span>
      </button>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-2 py-10 text-center" style={revealStyle(open, 2)}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-overlay-default">
            <History className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
          </span>
          <p className="text-[12px] text-text-muted">No recently viewed tickets yet</p>
          <p className="max-w-[240px] text-[11px] leading-[1.6] text-text-muted/70">
            Tickets you open on the board, in refinement or on their page show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col px-1">
            {BUCKETS.map((bucket) => {
              const group = entries.filter((e) => bucketOf(e.viewedAt) === bucket);
              if (group.length === 0) return null;
              return (
                <div key={bucket}>
                  <p className="px-1 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted first:pt-1.5">
                    {bucket}
                  </p>
                  {group.map((entry) => (
                    // The buckets partition the most-recent-first list in
                    // order, so the flat position doubles as the stagger index.
                    <RecentRow
                      key={entry.key}
                      entry={entry}
                      isCurrent={pathname.includes(entry.key)}
                      index={entries.indexOf(entry)}
                      open={open}
                      onOpen={openTicket}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border-subtle px-1.5 pt-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Last {entries.length} tickets
            </span>
            <button
              type="button"
              onClick={clearRecentlyViewed}
              className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] text-text-muted transition-colors duration-150 hover:text-text-secondary active:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <Eraser className="h-3 w-3" strokeWidth={1.5} />
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}
