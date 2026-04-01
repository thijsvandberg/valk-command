"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Ticket, POStatus, TicketDetail } from "@/types/ticket";
import { EPIC_COLORS, PO_STATUS_OPTIONS } from "@/types/ticket";
import { ChevronDown, ChevronsUp, ChevronUp, Minus, ChevronsDown } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { QualityBadge } from "@/components/sprint-board/TicketTable";
import { PO_STATUS_COLORS } from "@/components/sprint-board/FilterBar";

const PRIORITY_COLORS: Record<string, { icon: string; text: string }> = {
  Highest: { icon: "#e5534b", text: "#e5534b" },
  High: { icon: "#ea8744", text: "#ea8744" },
  Medium: { icon: "#eab308", text: "#eab308" },
  Low: { icon: "#4a90d9", text: "#4a90d9" },
  Lowest: { icon: "#94a3b8", text: "#94a3b8" },
};

const PRIORITY_ICONS: Record<string, { Icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>; color: string }> = {
  Highest: { Icon: ChevronsUp,   color: "#e5534b" },
  High:    { Icon: ChevronUp,    color: "#ea8744" },
  Medium:  { Icon: Minus,        color: "#eab308" },
  Low:     { Icon: ChevronDown,  color: "#4a90d9" },
  Lowest:  { Icon: ChevronsDown, color: "#94a3b8" },
};

function PriorityIcon({ priority }: { priority: string }) {
  const entry = PRIORITY_ICONS[priority];
  if (!entry) return null;
  const { Icon, color } = entry;
  return <Icon size={14} strokeWidth={2} style={{ color }} />;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="shrink-0 text-xs text-white/30">{label}</span>
      <div className="min-w-0 text-right text-sm text-white/60">{children}</div>
    </div>
  );
}

export function TicketSidebar({
  ticket,
  detail,
}: {
  ticket: Ticket;
  detail: TicketDetail | undefined;
}) {
  const [poStatus, setPoStatus] = useState<POStatus>(ticket.poStatus);
  const [poNotes, setPoNotes] = useState(ticket.notes);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    }
    if (statusOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [statusOpen]);

  const handlePoStatusChange = useCallback(async (v: POStatus) => {
    setPoStatus(v);
    setStatusOpen(false);
    try {
      await fetch(`/api/tickets/${ticket.key}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poStatus: v }),
      });
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticket.key]);

  const handleNotesChange = useCallback(async (notes: string) => {
    setPoNotes(notes);
    try {
      await fetch(`/api/tickets/${ticket.key}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poNotes: notes }),
      });
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticket.key]);

  const epicColor = ticket.epic ? EPIC_COLORS[ticket.epic] : null;
  const priority = detail?.priority ?? "Medium";
  const priorityColor = PRIORITY_COLORS[priority];

  return (
    <div className="w-72 shrink-0 space-y-6 border-l border-white/[0.06] bg-[var(--color-surface-elevated)] p-5 xl:w-80">
      {/* Jira details */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/25">Details</h3>
        <div className="mt-2 divide-y divide-white/[0.04]">
          <DetailRow label="Points">
            <span className="tabular-nums">{ticket.storyPoints ?? "--"}</span>
          </DetailRow>
          <DetailRow label="Assignee">
            <div className="flex items-center justify-end gap-2">
              <span className="truncate">{ticket.assignee?.name ?? "Unassigned"}</span>
              <Avatar assignee={ticket.assignee} size={20} />
            </div>
          </DetailRow>
          {detail?.reporter && (
            <DetailRow label="Reporter">
              <div className="flex items-center justify-end gap-2">
                <span className="truncate">{detail.reporter.name}</span>
                <Avatar assignee={detail.reporter} size={20} />
              </div>
            </DetailRow>
          )}
          {detail?.labels && detail.labels.length > 0 && (
            <DetailRow label="Labels">
              <div className="flex flex-wrap justify-end gap-1">
                {detail.labels.map((l) => (
                  <span key={l} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40">
                    {l}
                  </span>
                ))}
              </div>
            </DetailRow>
          )}
          <DetailRow label="Sprint">
            <span>--</span>
          </DetailRow>
          {ticket.epic && (
            <DetailRow label="Epic">
              <span
                className="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                style={epicColor ? { backgroundColor: epicColor.bg, color: epicColor.text } : {}}
              >
                {ticket.epic}
              </span>
            </DetailRow>
          )}
          <DetailRow label="Priority">
            <div className="flex items-center justify-end gap-1.5">
              <span style={{ color: priorityColor?.text }}>{priority}</span>
              <PriorityIcon priority={priority} />
            </div>
          </DetailRow>
          {detail?.components && detail.components.length > 0 && (
            <DetailRow label="Components">
              <div className="flex flex-wrap justify-end gap-1">
                {detail.components.map((c) => (
                  <span key={c} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40">
                    {c}
                  </span>
                ))}
              </div>
            </DetailRow>
          )}
          {detail && (
            <>
              <DetailRow label="Created">
                {new Date(detail.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </DetailRow>
              <DetailRow label="Updated">
                {new Date(detail.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </DetailRow>
            </>
          )}
        </div>
      </div>

      {/* PO Metadata */}
      <div>
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/25">
          PO Metadata
          {poNotes.trim() && (
            <span
              className="h-2 w-2 rounded-full bg-[var(--color-brand-500)]"
              title="Has PO notes"
            />
          )}
        </h3>
        <div className="mt-3 space-y-4">
          {/* PO Status */}
          <div>
            <label className="mb-1.5 block text-xs text-white/30">PO Status</label>
            <div ref={statusRef} className="relative">
              <button
                type="button"
                onClick={() => setStatusOpen(!statusOpen)}
                className="flex w-full items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-sm cursor-pointer hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <span className="flex items-center gap-2">
                  {poStatus && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: PO_STATUS_COLORS[poStatus]?.dot ?? "#94a3b8" }}
                    />
                  )}
                  <span className="text-white/60">{poStatus ?? "--"}</span>
                </span>
                <ChevronDown size={12} strokeWidth={1.2} className="text-white/25" />
              </button>
              {statusOpen && (
                <div className="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  {PO_STATUS_OPTIONS.map((opt) => {
                    const optColors = opt.value ? PO_STATUS_COLORS[opt.value] : null;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => handlePoStatusChange(opt.value)}
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-white/[0.04] ${
                          opt.value === poStatus ? "text-white" : "text-white/50"
                        }`}
                      >
                        {optColors && (
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: optColors.dot }} />
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quality Score */}
          <div>
            <label className="mb-1.5 block text-xs text-white/30">Quality Score</label>
            <div className="flex items-center gap-2">
              <QualityBadge score={ticket.qualityScore} />
            </div>
          </div>

          {/* PO Notes */}
          <div>
            <label className="mb-1.5 block text-xs text-white/30">Notes</label>
            <textarea
              defaultValue={poNotes}
              placeholder="Add PO notes..."
              rows={3}
              onBlur={(e) => handleNotesChange(e.target.value)}
              className="w-full resize-none rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/70 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
