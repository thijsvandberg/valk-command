"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import dynamic from "next/dynamic";
import { Inbox, Check, Undo2 } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/Button";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Tooltip } from "@/components/shared/Tooltip";
import { Checkbox } from "@/components/shared/Checkbox";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { BoardRow } from "@/components/sprint-board/BoardRow";
import { GroupCard } from "@/components/sprint-board/GroupCard";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { UnifiedControlsCluster } from "@/components/sprint-board/UnifiedControlsCluster";
import { InboxGroupByDropdown } from "@/components/sprint-board/InboxGroupByDropdown";
import { useInboxFilters } from "@/components/sprint-board/useInboxFilters";
import { useInboxGroupBy } from "@/components/sprint-board/useInboxGroupBy";
import { INBOX_SORT_OPTIONS } from "@/components/sprint-board/filter-bar-types";
import { saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import { CONTENT_MAX } from "@/lib/layout";
import type { JiraStatus, Ticket } from "@/types/ticket";
import type { NewStoriesResponse, NewStoryRow } from "@/lib/new-stories-types";

// The full ticket management panel, shared with the sprint board / cleanup so a
// row click opens the identical side panel. Lazy: the heavier panel only loads
// once the PO opens a ticket.
const SidePanel = dynamic(
  () => import("@/components/sprint-board/SidePanel").then((m) => ({ default: m.SidePanel })),
  { ssr: false },
);

const LIST_KEY = "/api/new-stories";
const COUNT_KEY = "/api/new-stories/count";
const JSON_HEADERS = { "Content-Type": "application/json" };

function rowToTicket(row: NewStoryRow): Ticket {
  // Lightweight Ticket so the BoardRow paints instantly; SidePanel re-derives the
  // full content via its own detail fetch. The sprint name doubles as the sprint
  // id so the row's sprint chip renders (the inbox has no real sprint ids).
  return {
    key: row.key,
    title: row.title,
    type: row.type,
    epic: row.epic,
    epicKey: row.epicKey,
    jiraStatus: (row.jiraStatus ?? "TO DO") as JiraStatus,
    storyPoints: row.storyPoints,
    assignee: row.assignee,
    reporter: row.reporter,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    sprintId: row.sprintName ?? undefined,
    sprintDisplayName: row.sprintName,
    openSubtaskCount: 0,
    totalSubtaskCount: 0,
  };
}

export default function InboxPage() {
  const pageTitle = usePageTitle("New story inbox");
  const { toast, showToast, dismissToast } = useToast();

  const { data, isLoading, mutate: mutateList } = useSWR<NewStoriesResponse>(LIST_KEY);

  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const {
    filteredRows,
    searchQuery,
    setSearchQuery,
    searchCount,
    sortField,
    sortDir,
    onSortChange,
    activeFilterCount,
    visibleTags,
    filterProps,
  } = useInboxFilters(rows);

  // Configurable grouping over the already filtered + sorted rows, so search /
  // filter / sort still apply within each group (BRDG-358).
  const { groupBy, setGroupBy, groups, collapsedGroups, toggleCollapse } = useInboxGroupBy(filteredRows);

  // Identity sprint-name map so the BoardRow sprint chip shows the display name
  // (the inbox stores the name in sprintId, see rowToTicket).
  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) if (r.sprintName) map[r.sprintName] = r.sprintName;
    return map;
  }, [rows]);

  const refreshCount = useCallback(() => void globalMutate(COUNT_KEY), []);

  // Restore marked-read tickets: clear their read stamp on the server, then
  // revalidate so they slot back into the list.
  const undoMarkRead = useCallback(
    async (keys: string[]) => {
      dismissToast();
      await fetch("/api/new-stories/read", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ keys, read: false }),
      });
      await mutateList();
      refreshCount();
    },
    [dismissToast, mutateList, refreshCount],
  );

  const markRead = useCallback(
    async (keys: string[]) => {
      if (keys.length === 0) return;
      const removing = new Set(keys);
      // Optimistic: drop the rows immediately so the list never stalls.
      await mutateList(
        (cur) => (cur ? { rows: cur.rows.filter((r) => !removing.has(r.key)) } : cur),
        { revalidate: false },
      );
      setCheckedKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
      try {
        if (keys.length === 1) {
          await fetch("/api/new-stories/read", {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify({ key: keys[0], read: true }),
          });
        } else {
          await fetch("/api/new-stories/read", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ keys, read: true }),
          });
        }
      } finally {
        refreshCount();
      }
      showToast(
        <span className="flex items-center gap-2">
          Marked {keys.length} as read
          <button
            type="button"
            onClick={() => void undoMarkRead(keys)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-label font-medium text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
          >
            <Undo2 className="h-3 w-3" strokeWidth={2} />
            Undo
          </button>
        </span>,
        6000,
      );
    },
    [mutateList, refreshCount, showToast, undoMarkRead],
  );

  const onCheckboxClick = useCallback((key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allChecked = filteredRows.length > 0 && filteredRows.every((r) => checkedKeys.has(r.key));
  const toggleAll = useCallback(() => {
    setCheckedKeys((prev) => {
      const all = filteredRows.length > 0 && filteredRows.every((r) => prev.has(r.key));
      return all ? new Set() : new Set(filteredRows.map((r) => r.key));
    });
  }, [filteredRows]);

  // Per-group select-all: toggles exactly that group's keys in the shared
  // checkedKeys set, feeding the same mark-as-read bulk action (BRDG-358).
  const toggleGroup = useCallback((groupKeys: string[]) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = groupKeys.every((k) => next.has(k));
      for (const k of groupKeys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  // Build the panel ticket from the in-list row so it opens without a round trip;
  // fall back to a detail fetch only if the key is no longer in the list.
  const selectedRow = rows.find((r) => r.key === selectedKey) ?? null;
  const fallback = useTicketDetail(selectedKey && !selectedRow ? selectedKey : null);
  const panelTicket: Ticket | null = selectedRow
    ? rowToTicket(selectedRow)
    : (fallback.data ?? null);

  return (
    <>
      {pageTitle}
      <div className="flex h-full flex-col">
        <ViewHeader icon={<Inbox size={16} strokeWidth={1.5} />}>
          <ViewHeaderTitle>New story inbox</ViewHeaderTitle>
          {data && (
            <span className="ml-2 rounded-full bg-overlay-subtle px-2 py-0.5 text-label tabular-nums text-text-tertiary">
              {rows.length}
            </span>
          )}
        </ViewHeader>

        {/* Controls bar: search · sort · filter, mirroring the Sprint Board. */}
        <BarContainer>
          <div className={`${CONTENT_MAX} flex h-full items-center justify-end gap-1`}>
            <InboxGroupByDropdown value={groupBy} onChange={setGroupBy} />
            <UnifiedControlsCluster
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchCount={searchCount}
              sortField={sortField}
              sortDir={sortDir}
              onSortChange={onSortChange}
              sortOptions={INBOX_SORT_OPTIONS}
              sortDefaultField="created"
              activeFilterCount={activeFilterCount}
              filterProps={filterProps}
            />
          </div>
        </BarContainer>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-8 py-5">
              <div className={CONTENT_MAX}>
                {isLoading && !data ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-11 animate-pulse rounded-xl bg-overlay-subtle"
                        style={{ opacity: 1 - i * 0.12 }}
                      />
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <EmptyState />
                ) : filteredRows.length === 0 ? (
                  <NoMatchState />
                ) : (
                  <div className="space-y-3">
                    {groups.map((group) => {
                      const groupKeys = group.rows.map((r) => r.key);
                      const selectAllChecked =
                        groupKeys.length > 0 && groupKeys.every((k) => checkedKeys.has(k));
                      const selectAllIndeterminate =
                        !selectAllChecked && groupKeys.some((k) => checkedKeys.has(k));
                      const isCollapsed = collapsedGroups.has(group.key);
                      return (
                        <GroupCard
                          key={group.key}
                          isCollapsed={isCollapsed}
                          onToggleCollapse={() => toggleCollapse(group.key)}
                          header={
                            <GroupStatBar
                              tickets={group.rows.map(rowToTicket)}
                              label={group.label}
                              labelWidthClass=""
                              isCollapsed={isCollapsed}
                              onToggleCollapse={() => toggleCollapse(group.key)}
                              onSelectAll={() => toggleGroup(groupKeys)}
                              selectAllChecked={selectAllChecked}
                              selectAllIndeterminate={selectAllIndeterminate}
                              selectionActive={checkedKeys.size > 0}
                              sortField={sortField}
                              sortDir={sortDir}
                              spColumnHidden={!visibleTags.has("storyPoints")}
                              bvColumnHidden={!visibleTags.has("businessValue")}
                            />
                          }
                        >
                          <table className="w-full table-fixed border-collapse text-body-lg">
                            <tbody>
                              {group.rows.map((row, idx) => (
                                <BoardRow
                                  key={row.key}
                                  ticket={rowToTicket(row)}
                                  ticketIdx={idx}
                                  isChecked={checkedKeys.has(row.key)}
                                  isSelected={row.key === selectedKey}
                                  someChecked={checkedKeys.size > 0}
                                  isDragActive={false}
                                  tags={visibleTags}
                                  showSprint
                                  sprintNameMap={sprintNameMap}
                                  selectedTicket={selectedKey}
                                  onSelectTicket={(key) => setSelectedKey(key)}
                                  onCheckboxClick={(key) => onCheckboxClick(key)}
                                  onMarkRead={(key) => void markRead([key])}
                                  isLastInCard={idx === group.rows.length - 1}
                                />
                              ))}
                            </tbody>
                          </table>
                        </GroupCard>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {checkedKeys.size > 0 && (
              <BarContainer
                border
                borderPosition="top"
                className="bulk-bar-enter sticky bottom-0 z-50 bg-[var(--color-surface-base)] px-8"
              >
                <div className={`${CONTENT_MAX} flex items-center gap-2 sm:gap-3`}>
                  <Tooltip content={allChecked ? "Deselect all" : "Select all"}>
                    <button
                      type="button"
                      onClick={toggleAll}
                      aria-label={allChecked ? "Deselect all" : "Select all"}
                      className="flex shrink-0 items-center justify-center cursor-pointer"
                    >
                      <Checkbox checked={allChecked} indeterminate={!allChecked} />
                    </button>
                  </Tooltip>

                  <span className="shrink-0 text-body-sm font-medium text-text-secondary whitespace-nowrap tabular-nums">
                    {checkedKeys.size}/{filteredRows.length} selected
                  </span>

                  <BarDivider />

                  <Tooltip content="Mark the selected stories as read; they leave the inbox (undoable)">
                    <Button variant="primary" size="md" onClick={() => void markRead([...checkedKeys])}>
                      <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      Mark {checkedKeys.size} as read
                    </Button>
                  </Tooltip>

                  <div className="flex-1" />

                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 border-0 bg-transparent text-text-tertiary hover:bg-transparent hover:text-text-secondary"
                    onClick={() => setCheckedKeys(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              </BarContainer>
            )}
          </div>

          {selectedKey && panelTicket && (
            <SidePanel
              key={selectedKey}
              ticket={panelTicket}
              poStatus={null}
              readiness={panelTicket.readiness ?? null}
              onPoStatusChange={(v) => { void saveTicketMetadata(selectedKey, { poStatus: v }); }}
              onReadinessChange={(v) => { void saveTicketMetadata(selectedKey, { readiness: v }); }}
              onNotesChange={(notes) => { void saveTicketMetadata(selectedKey, { poNotes: notes }); }}
              onClose={() => setSelectedKey(null)}
              onShowToast={() => {}}
              onSelectTicket={setSelectedKey}
            />
          )}
        </div>
      </div>
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "var(--color-brand-subtle)", boxShadow: "var(--shadow-sm)" }}
      >
        <Inbox size={22} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
      </div>
      <h2 className="font-[var(--font-display)] text-heading-sm font-semibold text-text-primary">
        Inbox zero
      </h2>
      <p className="mt-1.5 max-w-sm text-body-sm leading-relaxed text-text-tertiary">
        No unread stories. Newly created stories appear here for review; mark them as read to clear them.
      </p>
    </div>
  );
}

function NoMatchState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-body-sm leading-relaxed text-text-tertiary">
        No stories match the current filters.
      </p>
    </div>
  );
}
