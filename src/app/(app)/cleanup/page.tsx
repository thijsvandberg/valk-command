"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { Trash2 } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import type { Ticket, JiraStatus, IssueType } from "@/types/ticket";
import {
  type CleanupResponse,
  type CleanupRow,
  type CleanupSort,
  type Disposition,
  type ScannedFilter,
} from "@/lib/cleanup-types";
import { filterRows, sortRows, scoreHeat, type CleanupFilters } from "./cleanup-utils";

// The selected ticket opens in the same rich panel the sprint board uses, so
// ticket management is identical across surfaces (BRDG-281/275).
const SidePanel = dynamic(
  () => import("@/components/sprint-board/SidePanel").then((m) => ({ default: m.SidePanel })),
  { ssr: false },
);

const SORT_OPTIONS: { value: CleanupSort; label: string }[] = [
  { value: "overall", label: "Overall score" },
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

const DISPOSITION_BADGE: Record<NonNullable<Disposition>, { label: string; color: string; bg: string }> = {
  candidate: { label: "Candidate", color: "var(--color-status-warning)", bg: "var(--color-status-warning-subtle)" },
  confirmed: { label: "Confirmed", color: "var(--color-status-error)", bg: "var(--color-status-error-subtle)" },
  dismissed: { label: "Dismissed", color: "var(--color-status-neutral)", bg: "var(--color-status-neutral-subtle)" },
};

const selectClass =
  "h-8 cursor-pointer rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-2.5 text-label font-medium text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]";

function ScoreBar({ score }: { score: number | null }) {
  const heat = scoreHeat(score);
  if (score == null) {
    return <span className="text-label text-text-muted">—</span>;
  }
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2" title={score.toFixed(2)}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full" style={{ backgroundColor: heat.track }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: heat.color }}
        />
      </div>
      <span className="tabular-nums text-label text-text-tertiary">{(score).toFixed(2)}</span>
    </div>
  );
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
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const params = new URLSearchParams({ sort });
  if (filters.scanned !== "all") params.set("scanned", filters.scanned);
  if (filters.disposition !== "all") {
    params.set("disposition", filters.disposition === null ? "none" : filters.disposition);
  }
  if (filters.minOverall > 0) params.set("minOverall", String(filters.minOverall));

  const { data, isLoading } = useSWR<CleanupResponse>(`/api/cleanup?${params.toString()}`);

  // Re-apply sort/filter client-side so the loaded list re-orders instantly when
  // controls change, without waiting on a refetch.
  const rows = useMemo(() => {
    if (!data) return [];
    return sortRows(filterRows(data.rows, filters), sort);
  }, [data, filters, sort]);

  const topics = data?.topics ?? [];

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
            </div>

            {/* Table */}
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
                <table className="w-full border-separate border-spacing-y-1.5">
                  <thead>
                    <tr className="text-left text-label uppercase tracking-wider text-text-muted">
                      <th className="px-3 py-2 font-medium">Ticket</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Last scanned</th>
                      {topics.map((t) => (
                        <th key={t.key} className="px-3 py-2 font-medium" title={t.live ? undefined : "Not scored yet"}>
                          {t.label}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-medium">Overall</th>
                      <th className="px-3 py-2 font-medium">Disposition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const active = row.key === selectedKey;
                      const badge = row.disposition ? DISPOSITION_BADGE[row.disposition] : null;
                      return (
                        <tr
                          key={row.key}
                          onClick={() => setSelectedKey(row.key)}
                          className={`group cursor-pointer text-body-sm transition-colors duration-150 ${
                            active ? "[&>td]:bg-[var(--color-brand-600)]/12" : "[&>td]:hover:bg-hover-list-item"
                          }`}
                        >
                          <td className="rounded-l-xl border-y border-l border-border-subtle px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="shrink-0 font-mono text-label font-semibold text-[var(--color-brand-300)]">{row.key}</span>
                              <span className="min-w-0 truncate text-text-secondary group-hover:text-text-primary">{row.title}</span>
                            </div>
                          </td>
                          <td className="border-y border-border-subtle px-3 py-2.5 text-label text-text-tertiary">{row.status}</td>
                          <td className="border-y border-border-subtle px-3 py-2.5 text-label text-text-tertiary">
                            {row.lastScannedAt ? (
                              <span title={formatAbsoluteDate(row.lastScannedAt)}>{relativeDate(row.lastScannedAt)}</span>
                            ) : (
                              <span className="text-text-muted">never</span>
                            )}
                          </td>
                          {topics.map((t) => (
                            <td key={t.key} className="border-y border-border-subtle px-3 py-2.5">
                              {t.live ? <ScoreBar score={row.topicScores[t.key] ?? null} /> : <span className="text-label text-text-muted">—</span>}
                            </td>
                          ))}
                          <td className="border-y border-border-subtle px-3 py-2.5">
                            <ScoreBar score={row.scanOverall} />
                          </td>
                          <td className="rounded-r-xl border-y border-r border-border-subtle px-3 py-2.5">
                            {badge ? (
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-label font-medium"
                                style={{ color: badge.color, backgroundColor: badge.bg }}
                              >
                                {badge.label}
                              </span>
                            ) : (
                              <span className="text-label text-text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
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
