"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { Bookmark } from "lucide-react";
import type { Ticket, TicketReadiness } from "@/types/ticket";
import type { InlineTagId } from "@/components/sprint-board/filter-bar-types";
import type { BookmarkEntry } from "@/lib/bookmarks";
import { tickets as ticketsApi, swrFetcher } from "@/lib/api-client";
import { useTickets, useJiraSprints, useTicketsByKeys } from "@/hooks/useSprintBoard";
import { mapJiraSprints, saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import { makeInboxDispatchAdapter, type RowDataAdapter } from "@/components/sprint-board/row-actions/adapter";
import { useRowActions } from "@/components/sprint-board/row-actions/useRowActions";
import { BoardRow } from "@/components/sprint-board/BoardRow";
import { GroupCard } from "@/components/sprint-board/GroupCard";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { CursorMenu, TicketActionMenuContent } from "@/components/sprint-board/ticket-action-menu";
import { ViewHeader } from "@/components/shared/ViewHeader";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { CONTENT_MAX } from "@/lib/layout";

const SidePanel = dynamic(
  () => import("@/components/sprint-board/SidePanel").then((m) => ({ default: m.SidePanel })),
  { ssr: false },
);

// Signals shown on a bookmark row: readiness on the pill + epic/assignee/notes/flag.
// SP/BV are intentionally omitted — estimating is not a bookmark-overview task (BRDG-355
// feedback), and dropping them also removes the reserved metric columns' dead space.
const ROW_TAGS = new Set<InlineTagId>(["poReadiness", "epic", "assignee", "notes", "flag", "refinement"]);

// Full cross-sprint overview of every bookmarked ticket (BRDG-355), rendered with the
// SAME BoardRow, selection, side panel and bulk bar as the board/inbox. Fed by the
// board's All-view list (full ticket data → readiness/scores render) and ordered by
// the /api/bookmarks batch (most-recently bookmarked first).
export default function BookmarksPage() {
  usePageTitle("Bookmarks");
  const { toast, showToast, dismissToast } = useToast();
  // Hydrate rows from the board's All-view feed. This is the whole-backlog list, but it
  // shares the SWR cache with the sprint board (the app home, `/` redirects there), so it
  // is warm on virtually every visit — a cold /bookmarks load reuses it rather than paying
  // a fresh fetch. A by-keys refactor would swap that one warm, shared list for uncapped,
  // uncached per-bookmark requests and lose the error/loading/mutate wiring, so it is not a
  // net win for this single-user app. Accepted deliberately (BRDG-481). Epics, which this
  // feed excludes, are fetched separately below.
  const { data: allTickets, error, isLoading, mutate: mutateTickets } = useTickets("__all__");
  const { data: order, isLoading: orderLoading } = useSWR<BookmarkEntry[]>(ticketsApi.bookmarksUrl(), swrFetcher, { revalidateOnFocus: false });
  const { sprints: rawSprints } = useJiraSprints();

  const sprints = useMemo(() => mapJiraSprints(rawSprints), [rawSprints]);
  const sprintNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    sprints.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [sprints]);

  // Epics are excluded from the board's All-view feed (`/api/tickets`), so a bookmarked
  // epic would hydrate to nothing here. Fetch those keys directly (the single-ticket
  // endpoint has no type filter) and merge them in so epics show on the page too
  // (BRDG-481) — matching the launcher, which reads /api/bookmarks straight.
  const epicKeys = useMemo(() => (order ?? []).filter((e) => e.type === "epic").map((e) => e.key), [order]);
  const epicTickets = useTicketsByKeys(epicKeys);

  // The /api/bookmarks batch is the authoritative "what is bookmarked" set (already
  // bookmarkedAt-desc); hydrate each entry with the full ticket from the All-view list
  // (plus the separately-fetched epics) so rows render readiness/epic/etc. Deriving from
  // the batch (not `allTickets` filtered) means any un-bookmark — from the row menu, bulk
  // bar or the side panel — drops the row as soon as the batch revalidates, and the open
  // panel auto-closes when its row disappears.
  const rows = useMemo(() => {
    if (!order) return [];
    const byKey = new Map((allTickets ?? []).map((t) => [t.key, t]));
    for (const t of epicTickets) byKey.set(t.key, t);
    return order.map((e) => byKey.get(e.key)).filter((t): t is Ticket => Boolean(t));
  }, [allTickets, order, epicTickets]);

  // --- Selection ---
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const rangeAnchorRef = useRef<{ index: number; checked: boolean } | null>(null);

  // Drop selections for rows that are no longer bookmarked (adjust during render).
  const visibleKeys = useMemo(() => new Set(rows.map((t) => t.key)), [rows]);
  const pruned = useMemo(() => {
    const next = new Set([...checkedKeys].filter((k) => visibleKeys.has(k)));
    return next.size === checkedKeys.size ? checkedKeys : next;
  }, [checkedKeys, visibleKeys]);
  if (pruned !== checkedKeys) setCheckedKeys(pruned);

  const handleRowCheckbox = useCallback((key: string, idx: number, shiftKey: boolean) => {
    const anchor = rangeAnchorRef.current;
    if (shiftKey && anchor) {
      const from = Math.min(anchor.index, idx);
      const to = Math.max(anchor.index, idx);
      const rangeKeys = rows.slice(from, to + 1).map((t) => t.key);
      setCheckedKeys((prev) => {
        const next = new Set(prev);
        for (const k of rangeKeys) { if (anchor.checked) next.add(k); else next.delete(k); }
        return next;
      });
      return;
    }
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      const willCheck = !next.has(key);
      rangeAnchorRef.current = { index: idx, checked: willCheck };
      if (willCheck) next.add(key); else next.delete(key);
      return next;
    });
  }, [rows]);

  const allChecked = rows.length > 0 && rows.every((t) => checkedKeys.has(t.key));
  const toggleAll = useCallback(() => {
    setCheckedKeys((prev) => (rows.length > 0 && rows.every((t) => prev.has(t.key)) ? new Set() : new Set(rows.map((t) => t.key))));
  }, [rows]);

  // --- Readiness map (BoardRow reads readiness from this map, not ticket.readiness) ---
  const readinessMap = useMemo(() => {
    const m: Record<string, TicketReadiness | null> = {};
    for (const t of rows) m[t.key] = t.readiness ?? null;
    return m;
  }, [rows]);

  // --- Row-actions dispatch (inbox model: write-through + revalidate, no board overlay) ---
  const [, setLocalMoves] = useState<Record<string, string | null>>({});
  const adapter = useMemo(() => {
    const dataAdapter: RowDataAdapter = {
      getTicket: (key) => rows.find((t) => t.key === key),
      getTickets: () => rows,
      mutate: () => { void mutateTickets(); },
      activeListKey: "/api/tickets",
      sprintNameMap,
    };
    return makeInboxDispatchAdapter(dataAdapter, { setLocalMoves });
  }, [rows, mutateTickets, sprintNameMap]);

  const ra = useRowActions({
    adapter,
    selectedKeys: checkedKeys,
    sprints,
    pinnedSprintIds: [],
    backlogTargetName: "Backlog",
    showToast,
    flagSource: "ticket",
  });
  const { rowMenu } = ra;

  // --- Side panel ticket (open in place, no navigation) ---
  const selectedTicketRow = rows.find((t) => t.key === selectedKey) ?? null;

  const contentBody = () => {
    if (error) return <DataErrorState error={error} variant="full" onRetry={() => void mutateTickets()} />;
    if ((isLoading || orderLoading) && rows.length === 0) return <LoadingState variant="spinner" label="Loading bookmarks..." />;
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<Bookmark size={20} strokeWidth={1.5} />}
          title="No bookmarks yet"
          description="Bookmark a story from its page, a board row, the right-click menu or the editor to keep it here for quick reference across sprints."
        />
      );
    }
    return (
      <GroupCard
        header={
          <GroupStatBar
            tickets={rows}
            label="Bookmarks"
            showStatusCounts={false}
            showWarnings={false}
            showMetrics={false}
            onSelectAll={toggleAll}
            selectAllChecked={allChecked}
            selectAllIndeterminate={!allChecked && checkedKeys.size > 0}
            selectionActive={checkedKeys.size > 0}
            alignSelectAllToRows
          />
        }
      >
        <table className="w-full table-fixed border-collapse text-body-lg">
          <tbody>
            {rows.map((t, idx) => (
              <BoardRow
                key={t.key}
                ticket={t}
                ticketIdx={idx}
                isChecked={checkedKeys.has(t.key)}
                isSelected={t.key === selectedKey}
                isContextTarget={rowMenu?.targets.has(t.key) ?? false}
                someChecked={checkedKeys.size > 0}
                isDragActive={false}
                hideRowAccent
                tags={ROW_TAGS}
                showSprint
                sprintNameMap={sprintNameMap}
                readinessMap={readinessMap}
                hideEmptyAssignee
                selectedTicket={selectedKey}
                onSelectTicket={(key) => setSelectedKey(key)}
                onCheckboxClick={(key, clickIdx, shiftKey) => handleRowCheckbox(key, clickIdx, shiftKey)}
                onRowContextMenu={ra.handleRowContextMenu}
                onReadinessChange={(key, r) => { void ra.bulkSetReadiness(r, new Set([key])); }}
                isLastInCard={idx === rows.length - 1}
              />
            ))}
          </tbody>
        </table>
      </GroupCard>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <ViewHeader icon={<Bookmark size={18} strokeWidth={1.5} />}>
        <div className="flex items-baseline gap-2">
          <h1 className="text-body-lg font-semibold text-text-primary">Bookmarks</h1>
          {rows.length > 0 && (
            <span className="text-body-sm text-text-muted">
              {rows.length} {rows.length === 1 ? "story" : "stories"}
            </span>
          )}
        </div>
      </ViewHeader>

      {/* Two-column layout like the inbox: the list is flex-1 (left) and the side panel
          docks as the right column when a row is selected. */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className={`flex-1 overflow-y-auto px-8 py-5 ${checkedKeys.size > 0 ? "pb-28" : ""}`}>
            <div className={CONTENT_MAX}>{contentBody()}</div>
          </div>
        </div>

        {selectedKey && selectedTicketRow && (
          <SidePanel
            key={selectedKey}
            ticket={selectedTicketRow}
            poStatus={null}
            readiness={readinessMap[selectedKey] ?? selectedTicketRow.readiness ?? null}
            onPoStatusChange={(v) => { void saveTicketMetadata(selectedKey, { poStatus: v }); }}
            onReadinessChange={(v) => { void saveTicketMetadata(selectedKey, { readiness: v }); }}
            onNotesChange={(notes) => { void saveTicketMetadata(selectedKey, { poNotes: notes }); }}
            onClose={() => setSelectedKey(null)}
            onShowToast={showToast}
            onSelectTicket={setSelectedKey}
            enableBackNavigation
          />
        )}
      </div>

      {checkedKeys.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-dropdown flex justify-center px-4 pb-6">
          <div className="pointer-events-auto">
            <BulkActionBar
              floating
              count={checkedKeys.size}
              totalCount={rows.length}
              allChecked={allChecked}
              onToggleAll={toggleAll}
              onClear={() => setCheckedKeys(new Set())}
              onSetStatus={ra.bulkSetStatus}
              onSetReadiness={ra.bulkSetReadiness}
              onSetEpic={(epicKey) => ra.bulkSetEpic(epicKey)}
              onUpdateAssignee={ra.bulkUpdateAssignee}
              onUpdateLabel={ra.bulkUpdateLabels}
              onSetFlagged={(flagged) => ra.bulkSetFlagged(flagged, null)}
              flagState={ra.computeFlagState(checkedKeys)}
              onSetBookmarked={(bookmarked) => ra.bulkSetBookmarked(bookmarked)}
              bookmarkState={ra.computeBookmarkState(checkedKeys)}
              sprints={sprints}
              onCopyToClipboard={() => ra.copySelected()}
            />
          </div>
        </div>
      )}

      {rowMenu && (
        <CursorMenu x={rowMenu.x} y={rowMenu.y} onClose={() => ra.setRowMenu(null)}>
          <TicketActionMenuContent
            onSetStatus={(s) => ra.bulkSetStatus(s, rowMenu.targets)}
            onSetReadiness={(r) => ra.bulkSetReadiness(r, rowMenu.targets)}
            onSetBookmarked={(bookmarked) => ra.bulkSetBookmarked(bookmarked, rowMenu.targets)}
            bookmarkState={ra.computeBookmarkState(rowMenu.targets)}
            onSetFlagged={(flagged) => ra.bulkSetFlagged(flagged, null, rowMenu.targets)}
            flagState={ra.computeFlagState(rowMenu.targets)}
            close={() => ra.setRowMenu(null)}
          />
        </CursorMenu>
      )}

      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </div>
  );
}
