"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  Square,
  Ban,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ActivityLogEntry } from "@/types/ticket";
import {
  entryTypeLabel,
  formatDuration,
  formatTimestamp,
  parseErrorDetail,
  PAGE_SIZE,
  TYPE_OPTIONS,
  STATUS_OPTIONS,
} from "./activity-helpers";

function StatusIcon({ status }: { status: ActivityLogEntry["status"] }) {
  if (status === "success") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-brand-400)]" strokeWidth={2} />;
  }
  if (status === "failed") {
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" strokeWidth={2} />;
  }
  if (status === "cancelled") {
    return <Ban className="h-3.5 w-3.5 text-white/30" strokeWidth={2} />;
  }
  return <RefreshCw className="h-3.5 w-3.5 text-white/30 animate-spin" strokeWidth={2} />;
}

function statusLabel(status: ActivityLogEntry["status"]): string {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Running";
}

function ScopeCell({
  scope,
  type,
  sprintMap,
}: {
  scope: string | null;
  type: ActivityLogEntry["type"];
  sprintMap: Map<string, string>;
}) {
  if (!scope || scope === "0") {
    return <span className="text-xs text-white/25 font-[var(--font-body)] truncate">-</span>;
  }

  // Ticket keys: comma-separated VPL-XXXXX patterns
  const ticketKeyPattern = /^[A-Z]+-\d+(,[A-Z]+-\d+)*$/;
  if (ticketKeyPattern.test(scope)) {
    const keys = scope.split(",");
    return (
      <div className="flex flex-wrap gap-1 min-w-0">
        {keys.map((key) => (
          <Link
            key={key}
            href={`/tickets/${key}`}
            className="text-xs font-[var(--font-body)] cursor-pointer transition-colors duration-150"
            style={{ color: "var(--color-brand-400)" }}
          >
            {key}
          </Link>
        ))}
      </div>
    );
  }

  // Sprint ID: numeric scope with a known sprint name
  const sprintName = sprintMap.get(scope);
  if (sprintName && (type === "sprint-sync" || type === "ticket-sync")) {
    return (
      <Link
        href={`/sprint-board?sprint=${scope}`}
        className="text-xs font-[var(--font-body)] truncate cursor-pointer transition-colors duration-150"
        style={{ color: "var(--color-brand-400)" }}
        title={sprintName}
      >
        {sprintName}
      </Link>
    );
  }

  // Fallback: plain text (e.g. "sprints", "history")
  return <span className="text-xs text-white/25 font-[var(--font-body)] truncate">{scope}</span>;
}

export function SelectFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="appearance-none rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-1.5 pr-7 text-xs text-white/60 font-[var(--font-body)] cursor-pointer hover:border-white/[0.1] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20 pointer-events-none" strokeWidth={2} />
    </div>
  );
}

export function ActivityTable({
  entries,
  isLoading,
  expandedIds,
  sprintMap,
  offset,
  hasMore,
  onToggleExpanded,
  onCancelSync,
  onAcknowledgeEntry,
  onSetOffset,
  rowRefsCallback,
}: {
  entries: ActivityLogEntry[] | undefined;
  isLoading: boolean;
  expandedIds: Set<string>;
  sprintMap: Map<string, string>;
  offset: number;
  hasMore: boolean;
  onToggleExpanded: (id: string) => void;
  onCancelSync: (id: string) => void;
  onAcknowledgeEntry: (id: string) => void;
  onSetOffset: (offset: number) => void;
  rowRefsCallback: (id: string, el: HTMLDivElement | null) => void;
}) {
  return (
    <>
      <div className="rounded-xl border border-border-default bg-[var(--color-surface-elevated)] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.2)]">
        {/* Header row */}
        <div className="grid grid-cols-[20px_1fr_140px_100px_140px_130px] gap-3 px-4 py-2.5 border-b border-border-default bg-white/[0.015]">
          <span />
          <span className="text-label font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)]">Type</span>
          <span className="text-label font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)]">Status</span>
          <span className="text-label font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)]">Duration</span>
          <span className="text-label font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)]">Scope</span>
          <span className="text-label font-semibold uppercase tracking-wide text-white/25 font-[var(--font-body)] text-right">Time</span>
        </div>

        {/* Loading state */}
        {isLoading && !entries && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-4 w-4 text-white/20 animate-spin" strokeWidth={2} />
          </div>
        )}

        {/* Empty state */}
        {entries?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Clock className="h-8 w-8 text-white/10" strokeWidth={1.5} />
            <span className="text-sm text-white/25 font-[var(--font-body)]">No activity entries found</span>
          </div>
        )}

        {/* Rows */}
        {entries?.map((entry, i) => {
          const isExpanded = expandedIds.has(entry.id);
          const { display: errorDisplay, structured } = parseErrorDetail(entry.errorDetail);
          const hasExpandableContent = !!(entry.summary || entry.errorDetail);

          return (
            <div key={entry.id} ref={(el) => rowRefsCallback(entry.id, el)}>
              <div
                className={`grid grid-cols-[20px_1fr_140px_100px_140px_130px] gap-3 px-4 py-3 items-start transition-colors duration-100 ${
                  i < (entries.length - 1) || isExpanded ? "border-b border-white/[0.03]" : ""
                } ${hasExpandableContent ? "hover:bg-white/[0.015] cursor-pointer" : ""}`}
                onClick={() => hasExpandableContent && onToggleExpanded(entry.id)}
              >
                {/* Expand chevron */}
                <div className="flex items-center justify-center pt-0.5">
                  {hasExpandableContent && (
                    <ChevronRight
                      className={`h-3 w-3 text-white/20 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                      strokeWidth={2}
                    />
                  )}
                </div>

                {/* Type + summary preview */}
                <div className="min-w-0">
                  <span className="text-xs text-white/70 font-[var(--font-body)]">
                    {entryTypeLabel(entry.type)}
                  </span>
                  {entry.summary && !isExpanded && (
                    <div className="text-label text-white/30 truncate font-[var(--font-body)] mt-0.5">
                      {entry.summary}
                    </div>
                  )}
                  {entry.status === "failed" && entry.errorDetail && !isExpanded && (
                    <div className="text-label text-amber-400/60 truncate font-[var(--font-body)] mt-0.5">
                      {errorDisplay}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <StatusIcon status={entry.status} />
                  <span className={`text-xs font-[var(--font-body)] ${
                    entry.status === "success" ? "text-[var(--color-brand-400)]/70" :
                    entry.status === "failed" ? "text-amber-400/70" :
                    entry.status === "cancelled" ? "text-white/30" :
                    "text-white/30"
                  }`}>
                    {statusLabel(entry.status)}
                  </span>
                  {entry.status === "running" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      icon={<Square className="h-2.5 w-2.5" strokeWidth={2} fill="currentColor" />}
                      onClick={() => onCancelSync(entry.id)}
                      title="Cancel this sync"
                      className="ml-1"
                    >
                      Cancel
                    </Button>
                  )}
                  {entry.status === "failed" && !entry.acknowledged && (
                    <button
                      type="button"
                      title="Dismiss"
                      onClick={() => onAcknowledgeEntry(entry.id)}
                      className="ml-1 flex items-center justify-center h-4 w-4 rounded text-white/20 hover:text-white/50 hover:bg-hover-interactive transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <X className="h-2.5 w-2.5" strokeWidth={2.5} />
                    </button>
                  )}
                </div>

                {/* Duration */}
                <span className="text-xs text-white/30 font-[var(--font-body)] tabular-nums">
                  {formatDuration(entry.durationMs)}
                </span>

                {/* Scope */}
                <div onClick={(e) => e.stopPropagation()}>
                  <ScopeCell scope={entry.scope} type={entry.type} sprintMap={sprintMap} />
                </div>

                {/* Timestamp */}
                <span className="text-xs text-white/25 font-[var(--font-body)] tabular-nums text-right">
                  {formatTimestamp(entry.startedAt)}
                </span>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className={`px-10 py-3 bg-white/[0.008] ${i < (entries.length - 1) ? "border-b border-white/[0.03]" : ""}`}>
                  {entry.summary && (
                    <div className="mb-2">
                      <span className="text-caption uppercase tracking-wide font-semibold text-white/20 font-[var(--font-body)]">Summary</span>
                      <p className="mt-1 text-xs text-white/50 font-[var(--font-body)] leading-relaxed">{entry.summary}</p>
                    </div>
                  )}
                  {entry.errorDetail && (
                    <div>
                      <span className="text-caption uppercase tracking-wide font-semibold text-white/20 font-[var(--font-body)]">Error detail</span>
                      {structured ? (
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(structured).map(([k, v]) => (
                            <span key={k} className="text-label font-[var(--font-body)]">
                              <span className="text-white/25">{k}: </span>
                              <span className="text-amber-400/70">{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-amber-400/60 font-[var(--font-body)] leading-relaxed break-all">{entry.errorDetail}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSetOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0}
        >
          Previous
        </Button>
        <span className="text-label text-white/20 font-[var(--font-body)]">
          Showing {offset + 1} - {offset + (entries?.length ?? 0)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSetOffset(offset + PAGE_SIZE)}
          disabled={!hasMore}
        >
          Next
        </Button>
      </div>
    </>
  );
}

export { TYPE_OPTIONS, STATUS_OPTIONS };
