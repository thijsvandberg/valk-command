"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Ticket, POStatus } from "@/types/ticket";
import { getEpicColor } from "@/types/ticket";
import Link from "next/link";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { POStatusCell, QualityBadge, getJiraUrl } from "./TicketTableCells";
import { JIRA_STATUS_COLORS } from "@/types/ticket";
import { useTicketDetail, useTicketVersions } from "@/hooks/useSprintBoard";
import { prefetchTicketDetail } from "@/lib/prefetch";
import { CloudSync, ExternalLink, SquareArrowOutUpRight, ArrowUpRight, Maximize2, Minimize2, X, AlertCircle, ChevronRight, History, CheckSquare, MessageSquare, Check, Link2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/Button";

// -- Simple markdown renderer for panel description --

function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      elements.push(<h3 key={`h-${i}`} className="mt-4 mb-1 font-[var(--font-display)] text-sm font-semibold text-white/80">{line.slice(3)}</h3>);
    } else if (line.startsWith("### ")) {
      elements.push(<h4 key={`h4-${i}`} className="mt-3 mb-1 text-xs font-semibold text-white/70">{line.slice(4)}</h4>);
    } else if (/^- \[[ x]\] /.test(line)) {
      const checked = line.startsWith("- [x] ");
      const content = line.slice(6);
      elements.push(
        <div key={`cb-${i}`} className="my-0.5 flex items-start gap-1.5 text-xs text-white/50">
          <span className={`mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded border ${checked ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10" : "border-white/[0.12] bg-white/[0.03]"}`}>
            {checked && <Check size={8} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}
          </span>
          <span className={checked ? "line-through opacity-60" : ""}>{content}</span>
        </div>
      );
    } else if (line.startsWith("- ")) {
      elements.push(<li key={`li-${i}`} className="ml-4 list-disc text-xs text-white/50">{line.slice(2)}</li>);
    } else if (/^\d+\. /.test(line)) {
      elements.push(<li key={`ol-${i}`} className="ml-4 list-decimal text-xs text-white/50">{line.replace(/^\d+\.\s*/, "")}</li>);
    } else if (line.trim() === "") {
      elements.push(<div key={`br-${i}`} className="h-1.5" />);
    } else {
      elements.push(<p key={`p-${i}`} className="text-xs leading-relaxed text-white/50">{line}</p>);
    }
  }
  return elements;
}

// -- Ticket description for side panel --

function TicketDescription({ ticketKey }: { ticketKey: string }) {
  const { data: detail } = useTicketDetail(ticketKey);
  const description = detail?.description as string | undefined;

  if (!description) {
    return (
      <div>
        <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-white/50">Description</h3>
        <p className="mt-2 text-xs text-white/25">No description</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-white/50">Description</h3>
      <div className="mt-2 max-h-64 overflow-y-auto">
        {renderSimpleMarkdown(description)}
      </div>
    </div>
  );
}

// -- Side panel --

const PANEL_STORAGE_KEY = "sprintBoardPanelWidth";
const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 320;

export function SidePanel({
  ticket,
  poStatus,
  onPoStatusChange,
  onNotesChange,
  onClose,
  onShowToast,
  adjacentKeys,
}: {
  ticket: Ticket;
  poStatus: POStatus;
  onPoStatusChange: (v: POStatus) => void;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  onShowToast: (message: string) => void;
  adjacentKeys?: { prev: string | null; next: string | null };
}) {
  const jiraStatusColor = JIRA_STATUS_COLORS[ticket.jiraStatus] || JIRA_STATUS_COLORS["TO DO"];
  const epicColor = ticket.epic ? getEpicColor(ticket.epic) ?? null : null;
  const [syncingTicket, setSyncingTicket] = useState(false);

  // Prefetch adjacent ticket details when this panel opens
  useEffect(() => {
    if (adjacentKeys?.prev) prefetchTicketDetail(adjacentKeys.prev);
    if (adjacentKeys?.next) prefetchTicketDetail(adjacentKeys.next);
  }, [adjacentKeys]);

  const handleSyncTicket = useCallback(async () => {
    setSyncingTicket(true);
    try {
      const [res] = await Promise.all([
        fetch("/api/jira/sync-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketKeys: [ticket.key] }),
        }),
        new Promise((r) => setTimeout(r, 400)),
      ]);
      if (res.ok) {
        onShowToast(`Synced ${ticket.key} from Jira`);
      }
    } finally {
      setSyncingTicket(false);
    }
  }, [ticket.key, onShowToast]);

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    const saved = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!saved) return DEFAULT_PANEL_WIDTH;
    const parsed = parseInt(saved, 10);
    return !isNaN(parsed) ? Math.max(MIN_PANEL_WIDTH, parsed) : DEFAULT_PANEL_WIDTH;
  });
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const savedWidthBeforeFullRef = useRef(panelWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      const newWidth = Math.max(MIN_PANEL_WIDTH, window.innerWidth - e.clientX);
      setPanelWidth(newWidth);
      localStorage.setItem(PANEL_STORAGE_KEY, String(newWidth));
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const toggleFullWidth = useCallback(() => {
    if (isFullWidth) {
      setPanelWidth(savedWidthBeforeFullRef.current);
      setIsFullWidth(false);
    } else {
      savedWidthBeforeFullRef.current = panelWidth;
      setIsFullWidth(true);
    }
  }, [isFullWidth, panelWidth]);

  const effectiveWidth = isFullWidth ? "100%" : `${panelWidth}px`;

  // Diff view state
  // Diff is only available in full-page ticket detail mode

  // Lazy-load ticket versions via SWR (only fetches when panel is open)
  const { data: apiVersions } = useTicketVersions(ticket.key);

  const ticketVersions = useMemo(() => {
    if (Array.isArray(apiVersions) && apiVersions.length > 0) {
      return apiVersions.map((v, idx) => ({
        versionNumber: idx + 1,
        date: v.date || new Date().toISOString(),
        contentHash: v.contentHash || "",
        content: v.content || "",
        updatedBy: v.updatedBy ?? null,
        updatedByAvatar: v.updatedByAvatar ?? null,
      }));
    }
    return [];
  }, [apiVersions]);

  const hasVersions = ticketVersions.length > 1;

  return (
    <div
      ref={panelRef}
      className="relative flex h-full shrink-0 flex-col border-l border-white/[0.06] bg-[var(--color-surface-elevated)]"
      style={{ width: effectiveWidth, minWidth: isFullWidth ? "100%" : MIN_PANEL_WIDTH }}
    >
      {/* Resize drag handle */}
      {!isFullWidth && (
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
          style={isDragging ? { backgroundColor: "rgba(46, 145, 73, 0.5)" } : {}}
        />
      )}

      {(
        <>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="group/key flex items-center gap-2.5">
              <IssueTypeIcon type={ticket.type} />
              <span className="font-mono text-sm font-medium text-white/70">
                {ticket.key}
              </span>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={<Link2 size={12} strokeWidth={1.5} />}
                onClick={async () => {
                  const url = getJiraUrl(ticket.key);
                  const text = `${ticket.title} - ${url}`;
                  try {
                    await navigator.clipboard.writeText(text);
                    onShowToast("Link copied");
                  } catch {
                    onShowToast("Failed to copy link");
                  }
                }}
                className="text-white/0 group-hover/key:text-white/30 hover:!text-white/60"
                title="Copy Jira link"
              />
              {ticket.editState === "draft" && (
                <span className="flex items-center gap-1 rounded bg-[#4a90d9]/10 px-1.5 py-0.5 text-[10px] text-[#4a90d9]/50" title="Unsaved draft">
                  draft
                </span>
              )}
              {ticket.editState === "local_edits" && (
                <span className="flex items-center gap-1 rounded bg-[#4a90d9]/10 px-1.5 py-0.5 text-[10px] text-[#4a90d9]/70" title="Has local changes not yet pushed to Jira">
                  local changes
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Write Story */}
              <a
                href={`/tickets/${ticket.key}/write`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-white/50 cursor-pointer bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150"
                title="Write story"
              >
                <PenLine className="h-3.5 w-3.5" strokeWidth={1.5} />
              </a>
              {/* Sync ticket from Jira */}
              <Button
                variant="secondary"
                size="md"
                iconOnly
                icon={<CloudSync className={`h-3.5 w-3.5 ${syncingTicket ? "animate-spin" : ""}`} strokeWidth={1.5} />}
                disabled={syncingTicket}
                onClick={handleSyncTicket}
                title="Sync ticket from Jira"
              />
              {/* Full width toggle */}
              <Button
                variant="ghost"
                size="md"
                iconOnly
                icon={isFullWidth
                  ? <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  : <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                }
                onClick={toggleFullWidth}
                title={isFullWidth ? "Restore panel width" : "Expand to full width"}
              />
              {/* Open in valk-command new tab */}
              <a
                href={`/tickets/${ticket.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-secondary-300)] cursor-pointer bg-[var(--color-secondary-500)]/15 border border-[var(--color-secondary-500)]/25 hover:bg-[var(--color-secondary-500)]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary-400)] active:scale-[0.97] transition-colors duration-150"
                title="Open in new tab"
              >
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </a>
              <Button
                variant="ghost"
                size="md"
                iconOnly
                icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />}
                onClick={onClose}
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <h2 className="font-[var(--font-display)] text-lg font-semibold leading-snug text-white">
              {ticket.title}
            </h2>

            {/* Conflict indicator */}
            {ticket.editState === "conflict" && (
              <Link
                href={`/tickets/${ticket.key}`}
                className="mt-3 flex w-full items-center gap-2.5 rounded-lg border border-[#ea8744]/20 bg-[#ea8744]/[0.06] px-3.5 py-2.5 text-left cursor-pointer hover:bg-[#ea8744]/[0.10] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.99]"
                style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-[#ea8744]" strokeWidth={1.5} />
                <div>
                  <span className="text-xs font-medium text-[#ea8744]">Conflict</span>
                  <span className="ml-1.5 text-xs text-white/30">Open full view to review diff</span>
                </div>
                <ChevronRight className="ml-auto h-2.5 w-2.5 text-white/20" strokeWidth={1.5} />
              </Link>
            )}

            {/* Status row */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: jiraStatusColor.bg, color: jiraStatusColor.text }}
              >
                {ticket.jiraStatus}
              </span>
              {epicColor && (
                <span
                  className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: epicColor.bg, color: epicColor.text }}
                >
                  {ticket.epic}
                </span>
              )}
              {ticket.storyPoints !== null && (
                <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-white/50">
                  {ticket.storyPoints} pts
                </span>
              )}
            </div>

            {/* Assignee */}
            <div className="mt-5 flex items-center gap-2.5">
              <Avatar assignee={ticket.assignee} />
              <span className="text-sm text-white/50">
                {ticket.assignee?.name || "Unassigned"}
              </span>
            </div>

            {/* Ticket description */}
            <div className="my-6 h-px bg-white/[0.06]" />
            <TicketDescription ticketKey={ticket.key} />

            {/* Divider */}
            <div className="my-6 h-px bg-white/[0.06]" />

            {/* PO Metadata section */}
            <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-white/50">
              PO Metadata
              {ticket.notes.trim() && (
                <span
                  className="h-2 w-2 rounded-full bg-[var(--color-brand-500)]"
                  title="Has PO notes"
                />
              )}
            </h3>

            <div className="mt-4 space-y-4">
              {/* PO Status */}
              <div>
                <label className="mb-1.5 block text-xs text-white/40">PO Status</label>
                <POStatusCell value={poStatus} onChange={onPoStatusChange} showLabel />
              </div>

              {/* Quality Score */}
              <div>
                <label className="mb-1.5 block text-xs text-white/40">Quality Score</label>
                <div className="flex items-center gap-2">
                  <QualityBadge score={ticket.qualityScore} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-xs text-white/40">Notes</label>
                <textarea
                  defaultValue={ticket.notes}
                  placeholder="Add PO notes..."
                  rows={3}
                  onBlur={(e) => onNotesChange(e.target.value)}
                  className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* View changes link for tickets with versions */}
            {hasVersions && (
              <>
                <div className="my-6 h-px bg-white/[0.06]" />
                <Link
                  href={`/tickets/${ticket.key}`}
                  className="flex items-center gap-2 text-xs text-[var(--color-brand-400)] cursor-pointer hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                  style={{ transition: "color 0.15s ease, transform 0.1s ease" }}
                >
                  <History className="h-3.5 w-3.5" strokeWidth={1.5} />
                  View changes ({ticketVersions.length} versions)
                </Link>
              </>
            )}

            {/* Actions */}
            <div className="my-6 h-px bg-white/[0.06]" />
            <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-white/50">
              Actions
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="ghost"
                size="lg"
                icon={<CheckSquare className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.5} />}
                onClick={() => {
                  onShowToast(`Review story queued for ${ticket.key}`);
                }}
                className="justify-start px-3 text-sm text-white/60 hover:text-white/80"
              >
                Review Story
              </Button>
              <a
                href={`/chat?ticket=${ticket.key}`}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-white/60 cursor-pointer hover:bg-white/[0.04] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.5} />
                Chat about this ticket
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
