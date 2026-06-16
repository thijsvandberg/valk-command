"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import dynamic from "next/dynamic";
import { Inbox, ChevronRight, ChevronDown, Check, Undo2 } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/Button";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Tooltip } from "@/components/shared/Tooltip";
import { Checkbox } from "@/components/shared/Checkbox";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import { EpicBadge, MetricChip, SprintOrBacklogBadge } from "@/components/shared/IssueMetaBadges";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { useDefaultTeam } from "@/hooks/useDefaultTeam";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import type { JiraStatus, Ticket } from "@/types/ticket";
import type { NewStoriesResponse, NewStoryRow } from "@/lib/new-stories-types";
import {
  groupNewStories,
  type TeamSection,
  type DateGroup,
  type UserTeamAssignment,
} from "@/lib/new-stories-grouping";

// The full ticket management panel, shared with the sprint board / cleanup so a
// row click opens the identical side panel (BRDG-356 AC). Lazy: the heavier
// panel only loads once the PO opens a ticket.
const SidePanel = dynamic(
  () => import("@/components/sprint-board/SidePanel").then((m) => ({ default: m.SidePanel })),
  { ssr: false },
);

const LIST_KEY = "/api/new-stories";
const COUNT_KEY = "/api/new-stories/count";
const JSON_HEADERS = { "Content-Type": "application/json" };

// One shared grid template so the column header and every data row stay aligned:
// select | Title | Author | Sprint | Epic | SP | Assignee | Created | mark-read.
const GRID =
  "grid grid-cols-[28px_minmax(0,1fr)_148px_120px_148px_48px_44px_104px_40px] items-center gap-3";

function rowToTicket(row: NewStoryRow): Ticket {
  // Lightweight Ticket so the panel header paints instantly; SidePanel re-derives
  // full content via its own detail fetch.
  return {
    key: row.key,
    title: row.title,
    type: row.type,
    epic: row.epic,
    epicKey: row.epicKey,
    jiraStatus: "TO DO" as JiraStatus,
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
    sprintDisplayName: row.sprintName,
    openSubtaskCount: 0,
    totalSubtaskCount: 0,
  };
}

export default function NewStoriesPage() {
  const pageTitle = usePageTitle("New stories");
  const { toast, showToast, dismissToast } = useToast();

  const { data, isLoading, mutate: mutateList } = useSWR<NewStoriesResponse>(LIST_KEY);
  const { data: teamData } = useSWR<{ assignments: UserTeamAssignment[] }>("/api/settings/user-teams");
  const { defaultTeam } = useDefaultTeam();

  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  // A single "now" per mount keeps the date buckets stable across re-renders.
  const [now] = useState(() => new Date());

  const groups = useMemo(
    () =>
      groupNewStories(rows, {
        assignments: teamData?.assignments ?? [],
        defaultTeam,
        now,
      }),
    [rows, teamData, defaultTeam, now],
  );

  const refreshCount = useCallback(() => void globalMutate(COUNT_KEY), []);

  // Restore marked-read tickets: clear their read stamp on the server, then
  // revalidate so they slot back into their groups.
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

  const toggleRow = useCallback((key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allChecked = rows.length > 0 && rows.every((r) => checkedKeys.has(r.key));
  const toggleAll = useCallback(() => {
    setCheckedKeys((prev) => {
      const all = rows.length > 0 && rows.every((r) => prev.has(r.key));
      return all ? new Set() : new Set(rows.map((r) => r.key));
    });
  }, [rows]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
          <ViewHeaderTitle>New stories</ViewHeaderTitle>
          {data && (
            <span className="ml-2 rounded-full bg-overlay-subtle px-2 py-0.5 text-label tabular-nums text-text-tertiary">
              {rows.length}
            </span>
          )}
        </ViewHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-8 py-5">
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
              ) : (
                <div className="overflow-clip rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)]">
                  {/* Column header */}
                  <div
                    className={`${GRID} border-b border-border-subtle bg-[var(--color-surface-base)]/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted`}
                  >
                    <span />
                    <span>Title</span>
                    <span>Author</span>
                    <span>Sprint</span>
                    <span>Epic</span>
                    <span className="text-center">SP</span>
                    <span className="text-center">Asgn</span>
                    <span>Created</span>
                    <span />
                  </div>

                  {groups.sections.map((section) => (
                    <SectionBlock
                      key={section.team ?? "all"}
                      section={section}
                      grouped={groups.grouped}
                      collapsed={collapsed}
                      onToggleCollapse={toggleCollapse}
                      checkedKeys={checkedKeys}
                      onToggleRow={toggleRow}
                      onSelect={setSelectedKey}
                      onMarkRead={(key) => void markRead([key])}
                      activeKey={selectedKey}
                    />
                  ))}
                </div>
              )}
            </div>

            {checkedKeys.size > 0 && (
              <BarContainer
                border
                borderPosition="top"
                className="bulk-bar-enter sticky bottom-0 z-50 gap-2 bg-[var(--color-surface-base)] px-8 sm:gap-3"
              >
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
                  {checkedKeys.size}/{rows.length} selected
                </span>

                <BarDivider />

                <Tooltip content="Mark the selected stories as read; they leave the inbox (undoable)">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => void markRead([...checkedKeys])}
                  >
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

function SectionBlock({
  section,
  grouped,
  collapsed,
  onToggleCollapse,
  checkedKeys,
  onToggleRow,
  onSelect,
  onMarkRead,
  activeKey,
}: {
  section: TeamSection;
  grouped: boolean;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  checkedKeys: Set<string>;
  onToggleRow: (key: string) => void;
  onSelect: (key: string) => void;
  onMarkRead: (key: string) => void;
  activeKey: string | null;
}) {
  const teamId = `team:${section.team ?? "all"}`;
  const teamCollapsed = collapsed.has(teamId);

  return (
    <>
      {grouped && section.label && (
        <CollapsibleHeading
          level="team"
          collapsed={teamCollapsed}
          onToggle={() => onToggleCollapse(teamId)}
          label={section.label}
          count={section.count}
          ownTeam={section.isOwnTeam}
        />
      )}
      {(!grouped || !teamCollapsed) &&
        section.dateGroups.map((dg: DateGroup) => {
          const dateId = `${teamId}:${dg.bucket}`;
          const dateCollapsed = collapsed.has(dateId);
          return (
            <div key={dateId}>
              <CollapsibleHeading
                level="date"
                collapsed={dateCollapsed}
                onToggle={() => onToggleCollapse(dateId)}
                label={dg.label}
                count={dg.rows.length}
                indented={grouped}
              />
              {!dateCollapsed &&
                dg.rows.map((row) => (
                  <StoryRow
                    key={row.key}
                    row={row}
                    checked={checkedKeys.has(row.key)}
                    active={row.key === activeKey}
                    onToggle={() => onToggleRow(row.key)}
                    onSelect={() => onSelect(row.key)}
                    onMarkRead={() => onMarkRead(row.key)}
                  />
                ))}
            </div>
          );
        })}
    </>
  );
}

function CollapsibleHeading({
  level,
  collapsed,
  onToggle,
  label,
  count,
  ownTeam = false,
  indented = false,
}: {
  level: "team" | "date";
  collapsed: boolean;
  onToggle: () => void;
  label: string;
  count: number;
  ownTeam?: boolean;
  indented?: boolean;
}) {
  const isTeam = level === "team";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className={[
        "flex w-full items-center gap-2 border-b border-border-subtle px-3 text-left transition-colors duration-150 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)]",
        isTeam ? "bg-[var(--color-surface-base)]/40 py-2" : "py-1.5",
        indented ? "pl-7" : "",
      ].join(" ")}
    >
      {collapsed ? (
        <ChevronRight size={13} strokeWidth={2} className="shrink-0 text-text-muted" />
      ) : (
        <ChevronDown size={13} strokeWidth={2} className="shrink-0 text-text-muted" />
      )}
      <span
        className={
          isTeam
            ? "font-display text-[13px] font-semibold tracking-[-0.01em] text-text-primary"
            : "text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary"
        }
      >
        {label}
      </span>
      {ownTeam && (
        <span className="rounded-full bg-[var(--color-brand-subtle)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-brand-300)]">
          Your team
        </span>
      )}
      <span className="text-[11px] tabular-nums text-text-muted">{count}</span>
    </button>
  );
}

function StoryRow({
  row,
  checked,
  active,
  onToggle,
  onSelect,
  onMarkRead,
}: {
  row: NewStoryRow;
  checked: boolean;
  active: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onMarkRead: () => void;
}) {
  return (
    <div
      className={`${GRID} group border-b border-border-subtle px-3 py-2 transition-colors duration-150 last:border-b-0 ${
        active ? "bg-[var(--color-brand-600)]/12" : "hover:bg-overlay-subtle"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={checked ? "Deselect" : "Select"}
        className="flex items-center justify-center cursor-pointer"
      >
        <Checkbox checked={checked} />
      </button>

      {/* Title: type icon + key + title, opens the side panel in place. */}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 items-center gap-2 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
      >
        <IssueTypeIcon type={row.type} size={13} />
        <span className="shrink-0 font-mono text-[11px] text-text-muted">{row.key}</span>
        <span className="min-w-0 truncate text-body-sm text-text-secondary transition-colors duration-150 group-hover:text-text-primary">
          {row.title}
        </span>
      </button>

      {/* Author */}
      {row.reporter ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar assignee={row.reporter} size={18} />
          <span className="min-w-0 truncate text-[12px] text-text-tertiary">{row.reporter.name}</span>
        </span>
      ) : (
        <span className="text-[12px] text-text-muted">—</span>
      )}

      {/* Sprint */}
      <span className="min-w-0">
        <SprintOrBacklogBadge sprintName={row.sprintName} />
      </span>

      {/* Epic */}
      <span className="min-w-0">
        {row.epic ? <EpicBadge epic={row.epic} className="max-w-[148px]" /> : <span className="text-[12px] text-text-muted">—</span>}
      </span>

      {/* SP */}
      <span className="flex justify-center">
        {row.storyPoints != null && row.storyPoints > 0 ? (
          <MetricChip metric="sp" value={row.storyPoints} />
        ) : (
          <span className="text-[12px] text-text-muted">—</span>
        )}
      </span>

      {/* Assignee */}
      <span className="flex justify-center">
        {row.assignee ? (
          <Tooltip content={`Assignee: ${row.assignee.name}`}>
            <Avatar assignee={row.assignee} size={18} />
          </Tooltip>
        ) : (
          <span className="text-[12px] text-text-muted">—</span>
        )}
      </span>

      {/* Created date */}
      <span
        className="text-[11px] tabular-nums text-text-tertiary"
        title={row.jiraCreatedAt ? formatAbsoluteDate(row.jiraCreatedAt) : ""}
      >
        {row.jiraCreatedAt ? relativeDate(row.jiraCreatedAt) : "—"}
      </span>

      {/* Mark-as-read */}
      <Tooltip content="Mark as read">
        <button
          type="button"
          onClick={onMarkRead}
          aria-label="Mark as read"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted opacity-0 transition-[opacity,colors] duration-150 cursor-pointer hover:bg-[var(--color-brand-subtle)] hover:text-[var(--color-brand-300)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] group-hover:opacity-100"
        >
          <Check className="h-4 w-4" strokeWidth={2} />
        </button>
      </Tooltip>
    </div>
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
