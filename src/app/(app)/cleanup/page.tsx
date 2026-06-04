"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import dynamic from "next/dynamic";
import { Trash2, Telescope, Clock, Flame, Check, BellOff, TrendingUp } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/Button";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Tooltip } from "@/components/shared/Tooltip";
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
import { filterRows, sortRows, scoreHeat, isRevivalCandidate, type CleanupFilters } from "./cleanup-utils";
import { type AutoScanSettings, autoScanSettings } from "@/lib/api-client";

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
  { value: "key", label: "Key" },
];

const SCANNED_OPTIONS: { value: ScannedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scanned", label: "Scanned" },
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

const selectClass =
  "h-8 cursor-pointer rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-2.5 text-label font-medium text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]";

// Default batch size for the quick "top X" selection actions. Kept modest to
// honour the epic's "small batches, never all at once" constraint.
const QUICK_TOP_X = 10;

interface QueueCounts {
  pending: number;
  running: number;
  done: number;
  error: number;
}

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
    type: "story" as IssueType,
    jiraStatus: (row.status as JiraStatus) ?? "TO DO",
    assignee: null,
  };
}

function rowToTicket(row: CleanupRow): Ticket {
  // A lightweight Ticket so the panel header renders instantly; the panel
  // re-derives full content via its own useTicketDetailPage.
  return {
    key: row.key,
    title: row.title,
    type: "story" as IssueType,
    epic: null,
    epicKey: null,
    jiraStatus: (row.status as JiraStatus) ?? "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
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

  // Poll the deep-dive queue so batch progress (queued/running/done) stays live
  // while the background runner drains it. 4s is responsive without hammering.
  const { data: queue, mutate: mutateQueue } = useSWR<QueueCounts>(
    "/api/cleanup/deep-scan",
    { refreshInterval: 4000 },
  );

  // Auto-scan settings: toggle + daily count. No polling needed; settings
  // change only on user action.
  const { data: autoSettings, mutate: mutateAutoSettings } = useSWR<AutoScanSettings>(
    "/api/cleanup/auto-scan-settings",
  );
  const [autoSaving, setAutoSaving] = useState(false);
  // Optimistic count value while the user edits the number input.
  const autoCountRef = useRef<HTMLInputElement>(null);

  const toggleAutoScan = useCallback(async () => {
    if (!autoSettings || autoSaving) return;
    setAutoSaving(true);
    try {
      const updated = await autoScanSettings.update({ enabled: !autoSettings.enabled });
      await mutateAutoSettings(updated, { revalidate: false });
    } catch {
      await mutateAutoSettings();
    } finally {
      setAutoSaving(false);
    }
  }, [autoSettings, autoSaving, mutateAutoSettings]);

  const commitAutoCount = useCallback(async () => {
    const raw = autoCountRef.current?.value;
    const n = raw ? parseInt(raw, 10) : NaN;
    if (!autoSettings || Number.isNaN(n) || n < 1 || n > 200) return;
    if (n === autoSettings.dailyCount) return;
    setAutoSaving(true);
    try {
      const updated = await autoScanSettings.update({ dailyCount: n });
      await mutateAutoSettings(updated, { revalidate: false });
    } catch {
      await mutateAutoSettings();
    } finally {
      setAutoSaving(false);
    }
  }, [autoSettings, mutateAutoSettings]);

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
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-8 py-3">
              <label className="flex items-center gap-1.5 text-label text-text-muted">
                Sort
                <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as CleanupSort)}>
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <span className="mx-1 h-5 w-px bg-overlay-default" />
              <select
                className={selectClass}
                value={filters.scanned}
                onChange={(e) => setFilters((f) => ({ ...f, scanned: e.target.value as ScannedFilter }))}
              >
                {SCANNED_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                className={selectClass}
                value={filters.disposition === null ? "none" : filters.disposition}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilters((f) => ({
                    ...f,
                    disposition: v === "all" ? "all" : v === "none" ? null : (v as Disposition),
                  }));
                }}
              >
                {DISPOSITION_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={o.value === null ? "none" : o.value}>{o.label}</option>
                ))}
              </select>
              <select
                className={selectClass}
                value={String(filters.minOverall)}
                onChange={(e) => setFilters((f) => ({ ...f, minOverall: Number(e.target.value) }))}
              >
                {THRESHOLD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Revival filter (BRDG-298): isolate "worth pulling up" tickets, the
                  opposite read from deprecation. Toggle, on the positive/green
                  treatment to match the row badge. */}
              <button
                type="button"
                aria-pressed={filters.revivalOnly}
                onClick={() => setFilters((f) => ({ ...f, revivalOnly: !f.revivalOnly }))}
                title="Show only revival candidates (worth pulling up)"
                className={[
                  "flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-label font-medium transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-status-success)]",
                  filters.revivalOnly
                    ? "border-[var(--color-status-success)]/50 text-[var(--color-status-success)]"
                    : "border-border-default text-text-secondary hover:border-[var(--color-status-success)]/40",
                ].join(" ")}
                style={filters.revivalOnly ? { backgroundColor: "var(--color-status-success-subtle)" } : undefined}
              >
                <TrendingUp size={13} strokeWidth={2} />
                Revival candidates
              </button>

              <span className="mx-1 h-5 w-px bg-overlay-default" />

              {/* Deep-dive quick actions: queue a small batch by ranked method. */}
              <Button
                variant="soft"
                size="md"
                disabled={enqueuing}
                onClick={() => void enqueue({ method: "worst-staleness", topX: QUICK_TOP_X })}
                title={`Queue the ${QUICK_TOP_X} most-likely-stale tickets for deep scan`}
              >
                <Flame className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                Worst staleness (top {QUICK_TOP_X})
              </Button>
              <Button
                variant="soft"
                size="md"
                disabled={enqueuing}
                onClick={() => void enqueue({ method: "oldest", topX: QUICK_TOP_X })}
                title={`Queue the ${QUICK_TOP_X} least-recently-scanned tickets for deep scan`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                Oldest (top {QUICK_TOP_X})
              </Button>

              {/* Auto-scan toggle + count. Placed before the queue progress so the
                  two controls read as a logical group: "auto mode state → queue state". */}
              {autoSettings !== undefined && (
                <span className="ml-auto flex items-center gap-2.5 text-label text-text-tertiary">
                  <span className="h-5 w-px bg-overlay-default" />
                  {/* Toggle pill */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoSettings.enabled}
                    onClick={() => void toggleAutoScan()}
                    disabled={autoSaving}
                    title={autoSettings.enabled ? "Disable auto background deep scan" : "Enable auto background deep scan"}
                    className={[
                      "relative flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      autoSettings.enabled
                        ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/25"
                        : "border-border-default bg-overlay-subtle",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "absolute h-2.5 w-2.5 rounded-full transition-[transform,background-color] duration-150",
                        autoSettings.enabled
                          ? "translate-x-[14px] bg-[var(--color-brand-400)]"
                          : "translate-x-[1px] bg-text-muted",
                      ].join(" ")}
                    />
                  </button>
                  {/* Status text + count input */}
                  {autoSettings.enabled ? (
                    <span className="flex items-center gap-1.5 tabular-nums">
                      <span>Auto:</span>
                      <span className="font-medium text-[var(--color-brand-400)]">ON</span>
                      <span className="text-text-muted">/</span>
                      <input
                        ref={autoCountRef}
                        type="number"
                        min={1}
                        max={200}
                        defaultValue={autoSettings.dailyCount}
                        key={autoSettings.dailyCount}
                        onBlur={() => void commitAutoCount()}
                        onKeyDown={(e) => { if (e.key === "Enter") void commitAutoCount(); }}
                        disabled={autoSaving}
                        aria-label="Auto scan daily count"
                        className={[
                          "h-6 w-10 rounded-md border border-border-default bg-[var(--color-surface-elevated)]",
                          "px-1.5 text-center text-label tabular-nums text-text-secondary",
                          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]",
                          "disabled:opacity-60",
                          // Remove native spinner arrows; the field is small and arrows waste space.
                          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        ].join(" ")}
                      />
                      <span>/ day</span>
                    </span>
                  ) : (
                    <span className="tabular-nums text-text-muted">Auto: off</span>
                  )}
                </span>
              )}

              {queue && (queue.pending > 0 || queue.running > 0 || queue.done > 0) && (
                <span className={[
                  "flex items-center gap-2 text-label tabular-nums text-text-tertiary",
                  autoSettings === undefined ? "ml-auto" : "",
                ].join(" ")}>
                  {autoSettings === undefined && <span className="h-5 w-px bg-overlay-default" />}
                  <Telescope size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                  <span title="Waiting in the deep-scan queue">{queue.pending} queued</span>
                  {queue.running > 0 && <span title="Currently being deep-scanned">{queue.running} running</span>}
                  <span title="Deep scans completed">{queue.done} done</span>
                  {queue.error > 0 && (
                    <span className="text-[var(--color-status-error)]" title="Deep scans that errored">{queue.error} error</span>
                  )}
                </span>
              )}
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
                      <ChildIssueRow
                        key={row.key}
                        item={rowToSubtask(row)}
                        isLast={idx === rows.length - 1}
                        spacious
                        inlineCheckbox
                        showStatus
                        selectable
                        isChecked={isChecked}
                        someChecked={checkedKeys.size > 0}
                        onCheckboxClick={() => toggleRow(row.key)}
                        onSelect={(key) => setReviewKey(key)}
                        className={active ? "bg-[var(--color-brand-600)]/12" : ""}
                        metadataSlot={metadata}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {checkedKeys.size > 0 && (
              <div className="sticky bottom-0 z-40 flex items-center gap-3 border-t border-border-default bg-[var(--color-surface-base)] px-8 py-3">
                <span className="text-body-sm font-medium text-text-secondary tabular-nums">
                  {checkedKeys.size} selected
                </span>
                <Button
                  variant="primary"
                  size="md"
                  disabled={enqueuing || disposing}
                  onClick={() => void deepScanSelected()}
                >
                  <Telescope className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  Deep-scan selected
                </Button>
                <span className="mx-1 h-5 w-px bg-overlay-default" />
                {/* Bulk disposition (BRDG-289): local markers only, no Jira write. */}
                <Button
                  variant="soft"
                  size="md"
                  disabled={disposing || enqueuing}
                  onClick={() => void bulkDispose("confirm")}
                  title="Confirm selected as removable (local only, no Jira write)"
                >
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  disabled={disposing || enqueuing}
                  onClick={() => void bulkDispose("dismiss")}
                  title="Dismiss selected as false positives (snooze)"
                >
                  <BellOff className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  Dismiss
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="border-0 bg-transparent text-text-tertiary hover:bg-transparent hover:text-text-secondary"
                  onClick={() => setCheckedKeys(new Set())}
                >
                  Clear
                </Button>
              </div>
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
