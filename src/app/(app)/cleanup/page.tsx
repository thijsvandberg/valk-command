"use client";

import { useMemo, useState, useCallback } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import dynamic from "next/dynamic";
import { Trash2, Telescope, Clock, Flame, Check, BellOff, TrendingUp, Sparkles } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/Button";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Tooltip } from "@/components/shared/Tooltip";
import { FilterDropdown } from "@/components/shared/FilterDropdown";
import { BarContainer, BarDivider } from "@/components/shared/BarContainer";
import { EpicBadge, SubtaskCountBadge, MetricChip, SprintOrBacklogBadge, EpicChildCountBadge } from "@/components/shared/IssueMetaBadges";
import { BACKLOG_FACET_VALUE, BACKLOG_FACET_LABEL } from "@/lib/cleanup-types";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { ChildIssueRow } from "@/components/ticket-detail/ChildIssueRow";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import type { Ticket, JiraStatus, IssueType, Subtask } from "@/types/ticket";
import {
  type CleanupResponse,
  type CleanupRow,
  type CleanupSort,
  type Disposition,
  type ScannedFilter,
} from "@/lib/cleanup-types";
import {
  filterRows,
  sortRows,
  scoreHeat,
  isRevivalCandidate,
  LAST_ACTIVITY_OPTIONS,
  type CleanupFilters,
  type LastActivityBucket,
} from "./cleanup-utils";
import { ScanControls } from "./ScanControls";
import { DeepScanQueuePanel, type QueueData } from "./DeepScanQueuePanel";

// Title-case label for an issue type, used in the type-filter dropdown.
const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  story: "Story",
  task: "Task",
  bug: "Bug",
  spike: "Spike",
  subtask: "Subtask",
  epic: "Epic",
};

// The selected ticket opens in the same rich panel the sprint board uses, so
// ticket management is identical across surfaces (BRDG-281/275).
const SidePanel = dynamic(
  () => import("@/components/sprint-board/SidePanel").then((m) => ({ default: m.SidePanel })),
  { ssr: false },
);

// The score-breakdown + disposition drawer (BRDG-289). Lazy so the heavier
// review surface only loads once the PO opens a candidate.
const DispositionPanel = dynamic(
  () => import("./DispositionPanel").then((m) => ({ default: m.DispositionPanel })),
  { ssr: false },
);

const SORT_OPTIONS: { value: CleanupSort; label: string }[] = [
  { value: "overall", label: "Overall score" },
  { value: "revival", label: "Revival score" },
  { value: "staleness", label: "Staleness" },
  { value: "lastScanned-oldest", label: "Last scanned (oldest)" },
  { value: "lastScanned-newest", label: "Last scanned (newest)" },
  { value: "deepScanned-newest", label: "Deep-scanned (newest)" },
  { value: "key", label: "Key" },
];

const SCANNED_OPTIONS: { value: ScannedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scanned", label: "Scanned" },
  { value: "deep", label: "Deep-scanned" },
  { value: "never", label: "Never scanned" },
];

const DISPOSITION_OPTIONS: { value: Disposition | "all"; label: string }[] = [
  { value: "all", label: "Any disposition" },
  { value: null, label: "Unset" },
  { value: "candidate", label: "Candidate" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dismissed", label: "Dismissed" },
];

const THRESHOLD_OPTIONS = [
  { value: 0, label: "Any score" },
  { value: 0.35, label: "≥ 0.35" },
  { value: 0.6, label: "≥ 0.60" },
  { value: 0.75, label: "≥ 0.75" },
];

// Default batch size for the quick "top X" selection actions. Kept modest to
// honour the epic's "small batches, never all at once" constraint.
const QUICK_TOP_X = 10;

// Shared 18px-high chip geometry, matching IssueMetaBadges so the trailing
// cleanup badges line up with the rest of the app's list rows.
const CLEANUP_CHIP = "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-none tabular-nums";

// Compact deprecation-likelihood badge: collapses the former per-topic score
// columns into one chip on the row (full breakdown lives in the drawer). Uses the
// existing heat ramp so colour reads as "how likely this can go".
function DeprecationScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className={`${CLEANUP_CHIP} bg-overlay-subtle text-text-muted`} title="Not scored yet">
        —
      </span>
    );
  }
  const heat = scoreHeat(score);
  return (
    <Tooltip content={`Deprecation likelihood ${score.toFixed(2)}`}>
      <span className={CLEANUP_CHIP} style={{ color: heat.color, backgroundColor: heat.track }}>
        <Trash2 size={11} strokeWidth={1.75} className="opacity-80" />
        {score.toFixed(2)}
      </span>
    </Tooltip>
  );
}

// Revival badge: the opposite read. Upward arrow + positive/green treatment so
// it is unmistakably distinct from the deprecation badge. Only shown when the row
// crosses the backend revival threshold (BRDG-298).
function RevivalBadge({ score }: { score: number }) {
  return (
    <Tooltip content={`Worth pulling up — revival ${score.toFixed(2)}`}>
      <span
        className={CLEANUP_CHIP}
        style={{ color: "var(--color-status-success)", backgroundColor: "var(--color-status-success-subtle)" }}
      >
        <TrendingUp size={11} strokeWidth={2} />
        {score.toFixed(2)}
      </span>
    </Tooltip>
  );
}

// Inline scan rationale (BRDG-298): a compact, muted secondary line under the
// row title showing WHY the deep scan flagged the ticket, so the PO can read the
// reasoning without opening each drawer. Truncated to one line with the full text
// on hover (Tooltip) and still fully available in the DispositionPanel. Only
// rendered when a rationale exists, so rationale-less rows keep their tight height.
// Indented to align with the title (past the checkbox gutter + status pill).
function RationaleLine({ rationale, onClick }: { rationale: string; onClick: () => void }) {
  return (
    <Tooltip content={rationale}>
      <button
        type="button"
        onClick={onClick}
        className="group/rationale flex w-full cursor-pointer items-start gap-1.5 pb-2 pl-[3.25rem] pr-3 text-left transition-colors duration-150 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)]"
      >
        <Sparkles
          size={11}
          strokeWidth={1.75}
          className="mt-[2px] shrink-0 text-text-muted transition-colors duration-150 group-hover/rationale:text-[var(--color-brand-400)]"
        />
        <span className="min-w-0 flex-1 truncate text-[12px] leading-snug text-text-muted transition-colors duration-150 group-hover/rationale:text-text-tertiary">
          {rationale}
        </span>
      </button>
    </Tooltip>
  );
}

const DISPOSITION_ROW_BADGE: Record<NonNullable<Disposition>, { label: string; color: string; bg: string }> = {
  candidate: { label: "Candidate", color: "var(--color-status-warning)", bg: "var(--color-status-warning-subtle)" },
  confirmed: { label: "Confirmed", color: "var(--color-status-error)", bg: "var(--color-status-error-subtle)" },
  dismissed: { label: "Dismissed", color: "var(--color-status-neutral)", bg: "var(--color-status-neutral-subtle)" },
};

// ChildIssueRow renders the shared ticket pill from a Subtask-shaped item; map the
// cleanup row onto that shape so /cleanup uses the same row/pill as the rest of
// the app and naturally fits the viewport (no bespoke wide table).
function rowToSubtask(row: CleanupRow): Subtask {
  return {
    key: row.key,
    title: row.title,
    // Real issue type drives the leading type icon in ChildIssueRow (PO feedback #1).
    type: row.type,
    jiraStatus: (row.status as JiraStatus) ?? "TO DO",
    assignee: row.assignee,
  };
}

function rowToTicket(row: CleanupRow): Ticket {
  // A lightweight Ticket so the panel header renders instantly; the panel
  // re-derives full content via its own useTicketDetailPage. Real type/epic/SP
  // so the header reads correctly before the detail fetch resolves.
  return {
    key: row.key,
    title: row.title,
    type: row.type,
    epic: row.epic,
    epicKey: row.epicKey,
    jiraStatus: (row.status as JiraStatus) ?? "TO DO",
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
    jiraUpdatedAt: row.jiraUpdatedAt,
    sprintDisplayName: row.sprintName,
    openSubtaskCount: row.openSubtaskCount,
    totalSubtaskCount: row.totalSubtaskCount,
  };
}

export default function CleanupPage() {
  const pageTitle = usePageTitle("Cleanup");

  const [sort, setSort] = useState<CleanupSort>("overall");
  const [filters, setFilters] = useState<CleanupFilters>({
    scanned: "all",
    disposition: "all",
    minOverall: 0,
    revivalOnly: false,
    // Facet filters are applied client-side over the full loaded list, so they
    // start empty ("any") and never enter the SWR key.
    types: new Set(),
    epicKeys: new Set(),
    assignees: new Set(),
    reporters: new Set(),
    lastActivity: new Set(),
    sprints: new Set(),
  });
  // Ticket open in the score-breakdown / disposition drawer (BRDG-289). Row
  // click opens this review drawer; the drawer can escalate to the full ticket
  // SidePanel below for management.
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  // Ticket open in the full management SidePanel (notes/status/etc.).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Multi-select for deep-scan enqueue and bulk disposition (distinct from the
  // single-row selections above): a set of ticket keys chosen via the row checkboxes.
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [enqueuing, setEnqueuing] = useState(false);
  const [disposing, setDisposing] = useState(false);

  const params = new URLSearchParams({ sort });
  if (filters.scanned !== "all") params.set("scanned", filters.scanned);
  if (filters.disposition !== "all") {
    params.set("disposition", filters.disposition === null ? "none" : filters.disposition);
  }
  if (filters.minOverall > 0) params.set("minOverall", String(filters.minOverall));

  const cleanupKey = `/api/cleanup?${params.toString()}`;
  const { data, isLoading, mutate: mutateCleanup } = useSWR<CleanupResponse>(cleanupKey);

  // Refresh the list (badges) plus any open breakdown drawer after a disposition
  // write. Both the explicit list key and the drawer's detail key are revalidated.
  const refreshAfterDisposition = useCallback(
    (keys: string[]) => {
      void mutateCleanup();
      for (const k of keys) {
        void globalMutate(`/api/cleanup/${encodeURIComponent(k)}/disposition`);
      }
    },
    [mutateCleanup],
  );

  const bulkDispose = useCallback(
    async (action: "confirm" | "dismiss") => {
      const keys = [...checkedKeys];
      if (keys.length === 0) return;
      setDisposing(true);
      try {
        await fetch("/api/cleanup/disposition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, keys }),
        });
        refreshAfterDisposition(keys);
        setCheckedKeys(new Set());
      } finally {
        setDisposing(false);
      }
    },
    [checkedKeys, refreshAfterDisposition],
  );

  // Poll the deep-dive queue so batch progress (queued/running/done) and the
  // item list stay live while the background runner drains it. 4s is responsive
  // without hammering. The queue panel reuses this single poll.
  const { data: queue, mutate: mutateQueue } = useSWR<QueueData>(
    "/api/cleanup/deep-scan",
    { refreshInterval: 4000 },
  );

  // After a scan toggle or "Run now", refresh both the queue and the row list:
  // a staleness pass rescores rows, a deep-scan run drains the queue.
  const refreshAfterScan = useCallback(() => {
    void mutateQueue();
    void mutateCleanup();
  }, [mutateQueue, mutateCleanup]);

  const enqueue = useCallback(
    async (body: Record<string, unknown>) => {
      setEnqueuing(true);
      try {
        await fetch("/api/cleanup/deep-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await mutateQueue();
      } finally {
        setEnqueuing(false);
      }
    },
    [mutateQueue],
  );

  const deepScanSelected = useCallback(async () => {
    const keys = [...checkedKeys];
    if (keys.length === 0) return;
    await enqueue({ method: "keys", keys });
    setCheckedKeys(new Set());
  }, [checkedKeys, enqueue]);

  // Re-apply sort/filter client-side so the loaded list re-orders instantly when
  // controls change, without waiting on a refetch.
  const rows = useMemo(() => {
    if (!data) return [];
    return sortRows(filterRows(data.rows, filters), sort);
  }, [data, filters, sort]);

  const toggleRow = useCallback((key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // All currently-visible (filtered) rows checked? Drives the select-all toggle in
  // the bulk bar. Empty list never reads as "all checked".
  const allVisibleChecked = rows.length > 0 && rows.every((r) => checkedKeys.has(r.key));
  const toggleAllVisible = useCallback(() => {
    setCheckedKeys((prev) => {
      const allChecked = rows.length > 0 && rows.every((r) => prev.has(r.key));
      if (allChecked) return new Set();
      return new Set(rows.map((r) => r.key));
    });
  }, [rows]);

  // Facet option lists from the server (cover the whole eligible backlog, not just
  // the current page). Memoised maps let the dropdowns show display labels while
  // selecting on the stable key (epic key) or name (people).
  const facets = data?.facets;
  const epicLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of facets?.epics ?? []) m[e.key] = e.name;
    return m;
  }, [facets]);
  const typeLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of facets?.types ?? []) m[t] = ISSUE_TYPE_LABEL[t];
    return m;
  }, [facets]);
  const activityLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of LAST_ACTIVITY_OPTIONS) m[o.value] = o.label;
    return m;
  }, []);
  // Sprint facet (BRDG-298): the backlog sentinel renders as "Backlog"; named
  // sprints render as themselves. Backlog-only eligibility means this usually
  // holds just the one option today.
  const sprintLabelMap = useMemo(() => {
    const m: Record<string, string> = { [BACKLOG_FACET_VALUE]: BACKLOG_FACET_LABEL };
    for (const s of facets?.sprints ?? []) {
      if (s !== BACKLOG_FACET_VALUE) m[s] = s;
    }
    return m;
  }, [facets]);

  // Build the panel ticket from the row so the panel opens without a fetch round
  // trip; fall back to a fetch only if the key is somehow not in the list.
  const selectedRow = rows.find((r) => r.key === selectedKey) ?? null;
  const fallback = useTicketDetail(selectedKey && !selectedRow ? selectedKey : null);
  const panelTicket: Ticket | null = selectedRow ? rowToTicket(selectedRow) : (fallback.data ?? null);

  const adjacentKeys = useMemo(() => {
    if (!selectedKey) return undefined;
    const idx = rows.findIndex((r) => r.key === selectedKey);
    if (idx === -1) return undefined;
    return {
      prev: idx > 0 ? rows[idx - 1].key : null,
      next: idx < rows.length - 1 ? rows[idx + 1].key : null,
    };
  }, [selectedKey, rows]);

  return (
    <>
      {pageTitle}
      <div className="flex h-full flex-col">
        <ViewHeader icon={<Trash2 size={16} strokeWidth={1.5} />}>
          <ViewHeaderTitle>Cleanup</ViewHeaderTitle>
          {data && (
            <span className="ml-2 rounded-full bg-overlay-subtle px-2 py-0.5 text-label tabular-nums text-text-tertiary">
              {rows.length}
            </span>
          )}
        </ViewHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Controls. Two rows of standard Bridge controls: row 1 = sort + the
                single-choice scan/disposition/score selects + quick-actions + auto +
                queue; row 2 = the multi-select facet filters (type/epic/assignee/
                reporter/last-activity) plus the revival toggle. Every control carries
                a tooltip explaining what it does (PO feedback #3). */}
            <div className="flex flex-col gap-2 border-b border-border-subtle px-8 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Tooltip content="Order the list by deprecation score, revival score, staleness, last-scanned time, or ticket key">
                  <LabeledSelect
                    label="Sort"
                    value={sort}
                    onChange={(v) => setSort(v as CleanupSort)}
                    options={SORT_OPTIONS}
                  />
                </Tooltip>
                <BarDivider />
                <Tooltip content="Show all tickets, only those already scored by a scan, or only never-scanned ones">
                  <LabeledSelect
                    label="Scanned"
                    value={filters.scanned}
                    onChange={(v) => setFilters((f) => ({ ...f, scanned: v as ScannedFilter }))}
                    options={SCANNED_OPTIONS}
                  />
                </Tooltip>
                <Tooltip content="Filter by your review decision: candidate, confirmed removable, dismissed, or not yet set">
                  <LabeledSelect
                    label="Disposition"
                    value={filters.disposition === null ? "none" : String(filters.disposition)}
                    onChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        disposition: v === "all" ? "all" : v === "none" ? null : (v as Disposition),
                      }))
                    }
                    options={DISPOSITION_OPTIONS.map((o) => ({
                      value: o.value === null ? "none" : String(o.value),
                      label: o.label,
                    }))}
                  />
                </Tooltip>
                <Tooltip content="Hide tickets below this deprecation-likelihood score (0 = show every score)">
                  <LabeledSelect
                    label="Min score"
                    value={String(filters.minOverall)}
                    onChange={(v) => setFilters((f) => ({ ...f, minOverall: Number(v) }))}
                    options={THRESHOLD_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                  />
                </Tooltip>

                <BarDivider />

                {/* Deep-dive quick actions: queue a small batch by ranked method. */}
                <Tooltip content={`Queue the ${QUICK_TOP_X} tickets most likely to be stale for a deep scan`}>
                  <Button
                    variant="soft"
                    size="md"
                    disabled={enqueuing}
                    onClick={() => void enqueue({ method: "worst-staleness", topX: QUICK_TOP_X })}
                  >
                    <Flame className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    Worst staleness (top {QUICK_TOP_X})
                  </Button>
                </Tooltip>
                <Tooltip content={`Queue the ${QUICK_TOP_X} least-recently-scanned tickets for a deep scan`}>
                  <Button
                    variant="soft"
                    size="md"
                    disabled={enqueuing}
                    onClick={() => void enqueue({ method: "oldest", topX: QUICK_TOP_X })}
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    Oldest (top {QUICK_TOP_X})
                  </Button>
                </Tooltip>

              {/* Scan governance + queue, pushed right. The Scans popover is the one
                  place all background scanning is turned on/off and triggered, and
                  reconciles the former standalone Auto toggle into a single auto
                  on/off (BRDG-298). The queue panel replaces the old inline counter. */}
              <span className="ml-auto flex items-center gap-2">
                <DeepScanQueuePanel queue={queue} onMutate={mutateQueue} />
                <ScanControls onRan={refreshAfterScan} />
              </span>
              </div>

              {/* Row 2: multi-select facet filters via the app-standard FilterDropdown
                  (PO feedback #2/#3). Each is a portal-anchored checkbox dropdown with a
                  count badge when active; epic/assignee/reporter are searchable since the
                  backlog can hold many. Empty selection = "any". */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label font-medium text-text-muted">Filter</span>
                <Tooltip content="Show only the selected issue types (story, task, bug, ...)">
                  <span className="inline-flex">
                    <FilterDropdown
                      label="Type"
                      options={(facets?.types ?? []) as string[]}
                      labelMap={typeLabelMap}
                      selected={filters.types as Set<string>}
                      onChange={(next) => setFilters((f) => ({ ...f, types: next as Set<IssueType> }))}
                      renderOption={(v) => (
                        <span className="flex items-center gap-1.5">
                          <IssueTypeIcon type={v} size={13} />
                          {typeLabelMap[v] ?? v}
                        </span>
                      )}
                    />
                  </span>
                </Tooltip>
                <Tooltip content="Show only tickets in the selected epics">
                  <span className="inline-flex">
                    <FilterDropdown
                      label="Epic"
                      searchable
                      searchPlaceholder="Search epics..."
                      options={(facets?.epics ?? []).map((e) => e.key)}
                      labelMap={epicLabelMap}
                      selected={filters.epicKeys}
                      onChange={(next) => setFilters((f) => ({ ...f, epicKeys: next }))}
                    />
                  </span>
                </Tooltip>
                <Tooltip content="Show only tickets assigned to the selected people">
                  <span className="inline-flex">
                    <FilterDropdown
                      label="Assignee"
                      searchable
                      searchPlaceholder="Search assignees..."
                      options={facets?.assignees ?? []}
                      selected={filters.assignees}
                      onChange={(next) => setFilters((f) => ({ ...f, assignees: next }))}
                    />
                  </span>
                </Tooltip>
                <Tooltip content="Show only tickets reported by the selected people">
                  <span className="inline-flex">
                    <FilterDropdown
                      label="Reporter"
                      searchable
                      searchPlaceholder="Search reporters..."
                      options={facets?.reporters ?? []}
                      selected={filters.reporters}
                      onChange={(next) => setFilters((f) => ({ ...f, reporters: next }))}
                    />
                  </span>
                </Tooltip>
                <Tooltip content="Show only tickets whose last Jira activity falls in the selected time periods">
                  <span className="inline-flex">
                    <FilterDropdown
                      label="Last activity"
                      options={LAST_ACTIVITY_OPTIONS.map((o) => o.value)}
                      labelMap={activityLabelMap}
                      selected={filters.lastActivity as Set<string>}
                      onChange={(next) => setFilters((f) => ({ ...f, lastActivity: next as Set<LastActivityBucket> }))}
                    />
                  </span>
                </Tooltip>
                <Tooltip content="Show only tickets in the selected sprints (or the backlog)">
                  <span className="inline-flex">
                    <FilterDropdown
                      label="Sprint"
                      options={facets?.sprints ?? []}
                      labelMap={sprintLabelMap}
                      selected={filters.sprints}
                      onChange={(next) => setFilters((f) => ({ ...f, sprints: next }))}
                    />
                  </span>
                </Tooltip>

                <BarDivider />

                {/* Revival filter (BRDG-298): isolate "worth pulling up" tickets, the
                    opposite read from deprecation. Toggle, on the positive/green
                    treatment to match the row badge. */}
                <Tooltip content="Show only revival candidates: low-backlog tickets the analyzer judges still worth pulling up">
                  <button
                    type="button"
                    aria-pressed={filters.revivalOnly}
                    onClick={() => setFilters((f) => ({ ...f, revivalOnly: !f.revivalOnly }))}
                    className={[
                      "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-label font-medium transition-colors duration-150 active:scale-[0.98]",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-status-success)]",
                      filters.revivalOnly
                        ? "border-[var(--color-status-success)]/50 text-[var(--color-status-success)]"
                        : "border-border-default text-text-secondary hover:border-[var(--color-status-success)]/40 hover:text-text-primary",
                    ].join(" ")}
                    style={filters.revivalOnly ? { backgroundColor: "var(--color-status-success-subtle)" } : undefined}
                  >
                    <TrendingUp size={13} strokeWidth={2} />
                    Revival candidates
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Ticket list. Reuses the app's standard ChildIssueRow (and its
                TicketStatusPill) so /cleanup matches every other ticket list and
                fits the viewport width: the former per-topic score columns are
                collapsed into trailing badges in the row's metadata slot, so there
                is no horizontal scroll. The full per-topic breakdown lives in the
                DispositionPanel drawer. */}
            <div className="flex-1 overflow-y-auto px-8 py-5">
              {isLoading && !data ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-overlay-subtle" style={{ opacity: 1 - i * 0.1 }} />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState hasData={Boolean(data && data.total > 0)} />
              ) : (
                <div className="overflow-clip rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)]">
                  {rows.map((row, idx) => {
                    const active = row.key === reviewKey || row.key === selectedKey;
                    const isChecked = checkedKeys.has(row.key);
                    const badge = row.disposition ? DISPOSITION_ROW_BADGE[row.disposition] : null;
                    const revival = isRevivalCandidate(row);
                    const metadata = (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {/* Standard issue-metadata badges (PO feedback #5): epic,
                            subtask count, story points — same chips the rest of the
                            app uses, fed the row's real data. */}
                        {row.epic && <EpicBadge epic={row.epic} className="max-w-[140px]" />}
                        {/* Sprint/backlog placement (BRDG-298): every row shows where
                            it lives; backlog-only eligibility means most read "Backlog". */}
                        <SprintOrBacklogBadge sprintName={row.sprintName} />
                        {/* Epics show their child-story count; everything else shows the
                            subtask count. The two are mutually exclusive per row. */}
                        {row.type === "epic" ? (
                          <EpicChildCountBadge count={row.epicChildCount} />
                        ) : (
                          <SubtaskCountBadge open={row.openSubtaskCount} total={row.totalSubtaskCount} />
                        )}
                        {row.storyPoints != null && row.storyPoints > 0 && (
                          <MetricChip metric="sp" value={row.storyPoints} />
                        )}
                        {row.assignee && (
                          <Tooltip content={`Assignee: ${row.assignee.name}`}>
                            <Avatar assignee={row.assignee} size={18} />
                          </Tooltip>
                        )}
                        {revival && row.revivalScore != null && <RevivalBadge score={row.revivalScore} />}
                        <DeprecationScoreBadge score={row.scanOverall} />
                        {badge && (
                          <span
                            className="inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-medium leading-none"
                            style={{ color: badge.color, backgroundColor: badge.bg }}
                          >
                            {badge.label}
                          </span>
                        )}
                        <span
                          className="shrink-0 text-[11px] tabular-nums text-text-muted"
                          title={row.lastScannedAt ? `Last scanned ${formatAbsoluteDate(row.lastScannedAt)}` : "Never scanned"}
                        >
                          {row.lastScannedAt ? relativeDate(row.lastScannedAt) : "never"}
                        </span>
                      </div>
                    );
                    return (
                      <div
                        key={row.key}
                        // Wrapper groups the row pill with its optional rationale
                        // line so they read as one block; the active tint moves here.
                        className={active ? "bg-[var(--color-brand-600)]/12" : ""}
                      >
                        <ChildIssueRow
                          item={rowToSubtask(row)}
                          isLast={idx === rows.length - 1}
                          spacious
                          inlineCheckbox
                          showStatus
                          showTypeIcon
                          selectable
                          isChecked={isChecked}
                          someChecked={checkedKeys.size > 0}
                          onCheckboxClick={() => toggleRow(row.key)}
                          onSelect={(key) => setReviewKey(key)}
                          metadataSlot={metadata}
                        />
                        {row.scanRationale && (
                          <RationaleLine
                            rationale={row.scanRationale}
                            onClick={() => setReviewKey(row.key)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Multi-select bulk bar, restyled to match the sprint board's
                BulkActionBar (PO feedback #4): the shared BarContainer footer with a
                brand select-all checkbox, a "N selected" counter, and standard Buttons.
                The cleanup-specific actions (deep-scan, confirm, dismiss) replace the
                board's update/AI dropdowns. */}
            {checkedKeys.size > 0 && (
              <BarContainer
                border
                borderPosition="top"
                className="sticky bottom-0 z-50 gap-2 bg-[var(--color-surface-base)] px-8 sm:gap-3"
              >
                {/* Select all / deselect all visible rows (mirrors the board's toggle). */}
                <Tooltip content={allVisibleChecked ? "Deselect all" : "Select all visible"}>
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    aria-label={allVisibleChecked ? "Deselect all" : "Select all visible"}
                    className="flex shrink-0 items-center justify-center cursor-pointer"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                        allVisibleChecked
                          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/20"
                          : "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10"
                      }`}
                    >
                      {allVisibleChecked ? (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--color-brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <div className="h-1.5 w-1.5 rounded-sm bg-[var(--color-brand-400)]" />
                      )}
                    </span>
                  </button>
                </Tooltip>

                <span className="shrink-0 text-body-sm font-medium text-text-secondary whitespace-nowrap tabular-nums">
                  {checkedKeys.size}/{rows.length} selected
                </span>

                <BarDivider />

                <Tooltip content="Queue the selected tickets for a Tier-2 deep scan">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={enqueuing || disposing}
                    onClick={() => void deepScanSelected()}
                  >
                    <Telescope className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    Deep-scan selected
                  </Button>
                </Tooltip>

                <BarDivider />

                {/* Bulk disposition (BRDG-289): local markers only, no Jira write. */}
                <Tooltip content="Confirm selected as removable (local only, no Jira write)">
                  <Button
                    variant="soft"
                    size="md"
                    disabled={disposing || enqueuing}
                    onClick={() => void bulkDispose("confirm")}
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    Confirm
                  </Button>
                </Tooltip>
                <Tooltip content="Dismiss selected as false positives (snoozes them from re-surfacing)">
                  <Button
                    variant="ghost"
                    size="md"
                    disabled={disposing || enqueuing}
                    onClick={() => void bulkDispose("dismiss")}
                  >
                    <BellOff className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    Dismiss
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

          {reviewKey && !selectedKey && (
            <DispositionPanel
              key={reviewKey}
              jiraKey={reviewKey}
              onOpenTicket={(k) => setSelectedKey(k)}
              onNavigate={(k) => setReviewKey(k)}
              onClose={() => setReviewKey(null)}
              onDisposed={() => refreshAfterDisposition([reviewKey])}
            />
          )}

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
              adjacentKeys={adjacentKeys}
            />
          )}
        </div>
      </div>
    </>
  );
}

// A single-choice select styled with the app's standard control tokens (the same
// border / surface / focus treatment the rest of Bridge's inline selects use). The
// app has no generic single-select dropdown component, so this keeps the sort and
// the scan/disposition/score filters consistent while the multi-select facet
// filters use FilterDropdown. A leading label sits inside the control so it reads
// as one labelled unit.
function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string | number | null; label: string }[];
}) {
  return (
    <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-border-default bg-overlay-subtle pl-2.5 pr-1.5 text-label font-medium text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text-primary focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--color-brand-400)]">
      <span className="text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-1 text-label font-medium text-text-secondary focus:outline-none"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value === null ? "none" : String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ hasData }: { hasData: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "var(--color-brand-subtle)", boxShadow: "var(--shadow-sm)" }}
      >
        <Trash2 size={22} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
      </div>
      <h2 className="font-[var(--font-display)] text-heading-sm font-semibold text-text-primary">
        {hasData ? "No tickets match these filters" : "Nothing scanned yet"}
      </h2>
      <p className="mt-1.5 max-w-sm text-body-sm leading-relaxed text-text-tertiary">
        {hasData
          ? "Loosen the filters above to see more of the backlog."
          : "Tier-1 staleness runs in the background. Scored tickets will appear here as they are evaluated."}
      </p>
    </div>
  );
}
