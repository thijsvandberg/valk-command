"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  GitBranch,
  Rocket,
  GitPullRequest,
  ExternalLink,
  RefreshCw,
  NotebookPen,
  Info,
  Trash2,
  X,
  Check,
  Bot,
  Timer,
} from "lucide-react";
import { useNotifications } from "@/hooks/usePipelines";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatExactTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Shows a late-sync indicator when eventAt is more than 30 minutes before createdAt.
// The threshold avoids false positives from minor clock skew or short polling delays.
const LATE_SYNC_THRESHOLD_MS = 30 * 60 * 1000;

function TimeAgo({ createdAt, eventAt }: { createdAt: string; eventAt?: string | null }) {
  const [visible, setVisible] = useState(false);
  const [syncVisible, setSyncVisible] = useState(false);
  const [pos, setPos] = useState<"above" | "below">("above");
  const ref = useRef<HTMLSpanElement>(null);
  const syncRef = useRef<HTMLSpanElement>(null);

  const displayIso = eventAt ?? createdAt;
  const syncGapMs = eventAt ? new Date(createdAt).getTime() - new Date(eventAt).getTime() : 0;
  const isLateSync = syncGapMs > LATE_SYNC_THRESHOLD_MS;

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos(rect.top > 60 ? "above" : "below");
    }
    setVisible(true);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        ref={ref}
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setVisible(false)}
      >
        <span className="text-caption text-text-muted tabular-nums cursor-default select-none">
          {formatTimeAgo(displayIso)}
        </span>
        {visible && (
          <span
            className={`pointer-events-none absolute left-0 z-tooltip whitespace-nowrap rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-2.5 py-1.5 text-label text-text-secondary shadow-[var(--shadow-md)] ${
              pos === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"
            }`}
          >
            {formatExactTime(displayIso)}
          </span>
        )}
      </span>
      {isLateSync && (
        <span
          ref={syncRef}
          className="relative inline-block"
          onMouseEnter={() => setSyncVisible(true)}
          onMouseLeave={() => setSyncVisible(false)}
        >
          <span className="text-caption text-text-muted tabular-nums cursor-default select-none">
            (synced {formatTimeAgo(createdAt)})
          </span>
          {syncVisible && (
            <span
              className={`pointer-events-none absolute left-0 z-tooltip whitespace-nowrap rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-2.5 py-1.5 text-label text-text-secondary shadow-[var(--shadow-md)] ${
                pos === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"
              }`}
            >
              Synced at {formatExactTime(createdAt)}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function renderMessage(
  message: string,
  jiraKey: string | null,
  href: string | null,
  onLinkClick: () => void,
): React.ReactNode {
  if (!jiraKey || !href || !message.includes(jiraKey)) return message;
  const idx = message.indexOf(jiraKey);
  return (
    <>
      {message.slice(0, idx)}
      <Link
        href={href}
        onClick={onLinkClick}
        className="font-mono text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150"
      >
        {jiraKey}
      </Link>
      {message.slice(idx + jiraKey.length)}
    </>
  );
}

function notificationIcon(type: string) {
  switch (type) {
    case "deployment":
      return <Rocket size={13} strokeWidth={1.5} className="text-violet-400" />;
    case "pipeline":
      return <GitBranch size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />;
    case "pr":
      return <GitPullRequest size={13} strokeWidth={1.5} className="text-amber-400" />;
    case "sync":
      return <RefreshCw size={13} strokeWidth={1.5} className="text-emerald-400" />;
    case "story-writer":
      return <NotebookPen size={13} strokeWidth={1.5} className="text-sky-400" />;
    case "system":
      return <Info size={13} strokeWidth={1.5} className="text-text-tertiary" />;
    case "agent":
      return <Bot size={13} strokeWidth={1.5} className="text-purple-400" />;
    case "scheduler":
      return <Timer size={13} strokeWidth={1.5} className="text-orange-400" />;
    default:
      return <Bell size={13} strokeWidth={1.5} className="text-text-tertiary" />;
  }
}


function typeLabel(type: string): string {
  switch (type) {
    case "pr":           return "Pull requests";
    case "pipeline":     return "Pipelines";
    case "deployment":   return "Deployments";
    case "story-writer": return "Story writer";
    case "sync":         return "Sync";
    case "agent":        return "Agent";
    case "scheduler":    return "Scheduler";
    case "system":       return "System";
    default:             return type;
  }
}

// Extracts team prefix from a sprint display name (e.g. "BM: 135" → "BM").
function extractTeamPrefix(sprintName: string | null): string | null {
  if (!sprintName) return null;
  const idx = sprintName.indexOf(": ");
  return idx > 0 ? sprintName.slice(0, idx) : null;
}

export function NotificationBell() {
  const { notifications, unreadCount, totalCount, markRead, markAllRead, clearRead, dismissOne, markFilteredRead, clearFiltered } = useNotifications(50);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const computePos = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);

  function handleToggle() {
    if (!open) computePos();
    if (open) {
      setActiveType(null);
      setActiveTeam(null);
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setActiveType(null);
        setActiveTeam(null);
      }
    }
    function handleResize() { computePos(); }
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, computePos]);

  // Derive per-type counts, per-team counts, and the filtered list from loaded notifications.
  // effectiveType/Team auto-clears when the active filter type or team has no more notifications.
  const { typeCounts, teamCounts, filteredNotifications, filteredUnreadIds, filteredReadIds, effectiveType, effectiveTeam } = useMemo(() => {
    const typeCounts = new Map<string, { total: number; unread: number }>();
    const teamCounts = new Map<string, { total: number; unread: number }>();

    for (const n of notifications) {
      const tc = typeCounts.get(n.type) ?? { total: 0, unread: 0 };
      tc.total++;
      if (!n.read) tc.unread++;
      typeCounts.set(n.type, tc);

      const team = extractTeamPrefix(n.sprintName);
      if (team) {
        const tmc = teamCounts.get(team) ?? { total: 0, unread: 0 };
        tmc.total++;
        if (!n.read) tmc.unread++;
        teamCounts.set(team, tmc);
      }
    }

    // If the active filter type/team has been fully cleared, treat it as inactive
    const effectiveType = activeType && typeCounts.has(activeType) ? activeType : null;
    const effectiveTeam = activeTeam && teamCounts.has(activeTeam) ? activeTeam : null;

    const filtered = notifications.filter((n) => {
      if (effectiveType && n.type !== effectiveType) return false;
      if (effectiveTeam) {
        const team = extractTeamPrefix(n.sprintName);
        if (team !== effectiveTeam) return false;
      }
      return true;
    });

    return {
      typeCounts,
      teamCounts,
      filteredNotifications: filtered,
      filteredUnreadIds: filtered.filter((n) => !n.read).map((n) => n.id),
      filteredReadIds: filtered.filter((n) => n.read).map((n) => n.id),
      effectiveType,
      effectiveTeam,
    };
  }, [notifications, activeType, activeTeam]);

  const hasFilter = effectiveType !== null || effectiveTeam !== null;

  function handleMarkAllRead() {
    if (hasFilter) markFilteredRead(filteredUnreadIds);
    else markAllRead();
  }

  function handleClearRead() {
    if (hasFilter) clearFiltered(filteredReadIds);
    else clearRead();
  }

  const hiddenCount = totalCount > 50 ? totalCount - 50 : 0;

  return (
    <div className="relative">
      {/* Bell button */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="md"
        iconOnly
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="relative border-0 bg-transparent"
        icon={
          <>
            <Bell size={16} strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-caption font-bold text-white tabular-nums shadow-[0_2px_6px_rgba(239,68,68,0.4)]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </>
        }
      />

      {/* Dropdown portal — rendered on document.body to escape any stacking context */}
      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right, zIndex: "var(--z-notification)" }}
        >
          <Card variant="floating" className="w-[360px] shadow-[var(--shadow-xl)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
            <span className="font-[var(--font-display)] text-body font-semibold text-text-secondary">
              Notifications
            </span>
            <div className="flex items-center gap-1">
              {filteredUnreadIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<CheckCheck size={12} strokeWidth={1.5} />}
                  onClick={handleMarkAllRead}
                >
                  Mark all read
                </Button>
              )}
              {filteredReadIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={12} strokeWidth={1.5} />}
                  onClick={handleClearRead}
                >
                  Clear read
                </Button>
              )}
            </div>
          </div>

          {/* Filter bar — type pills and team chips on one row */}
          {(typeCounts.size > 1 || teamCounts.size > 1) && (
            <div
              className="flex items-center gap-1 px-3 py-1.5 border-b border-border-default"
              role="toolbar"
              aria-label="Filter notifications"
            >
              {/* Type pills */}
              {typeCounts.size > 1 && [...typeCounts.entries()].map(([type, { unread }]) => {
                const isActive = effectiveType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveType(isActive ? null : type)}
                    aria-label={`${typeLabel(type)}${unread > 0 ? `: ${unread} unread` : ""}`}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1 h-6 rounded-md px-1.5 cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                      isActive ? "bg-overlay-strong" : "hover:bg-hover-list-item"
                    }`}
                  >
                    <div className={isActive ? "" : "opacity-35"}>
                      {notificationIcon(type)}
                    </div>
                    {unread > 0 && (
                      <span className="text-caption tabular-nums font-medium leading-none text-text-secondary">
                        {unread > 99 ? "99" : unread}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Separator between types and teams */}
              {typeCounts.size > 1 && teamCounts.size > 1 && (
                <span className="mx-1 h-3.5 w-px shrink-0 bg-overlay-strong" />
              )}

              {/* Team chips */}
              {teamCounts.size > 1 && [...teamCounts.entries()].map(([team, { unread }]) => {
                const isActive = effectiveTeam === team;
                return (
                  <button
                    key={team}
                    type="button"
                    onClick={() => setActiveTeam(isActive ? null : team)}
                    aria-pressed={isActive}
                    aria-label={`Team ${team}${unread > 0 ? `: ${unread} unread` : ""}`}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                      isActive
                        ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)] ring-1 ring-inset ring-[var(--color-brand-500)]/25"
                        : "bg-overlay-subtle text-text-tertiary hover:bg-overlay-default hover:text-text-secondary"
                    }`}
                  >
                    {team}
                    {unread > 0 && (
                      <span className="tabular-nums text-text-secondary">
                        {unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-body text-text-muted">
                No notifications yet
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-body text-text-muted">
                No notifications for this filter
              </div>
            ) : (
              <>
                {filteredNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={`group flex items-start gap-3 px-4 py-3 border-b border-border-subtle last:border-b-0 transition-colors duration-150 hover:bg-overlay-subtle ${
                      !n.read ? "bg-[var(--color-brand-500)]/[0.04]" : ""
                    }`}
                  >
                    {/* Icon */}
                    <div className="mt-0.5 shrink-0">{notificationIcon(n.type)}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-text-secondary leading-relaxed">
                        {renderMessage(
                          n.message,
                          n.jiraKey,
                          n.jiraKey
                            ? n.type === "story-writer"
                              ? `/tickets/${n.jiraKey}/write`
                              : `/tickets/${n.jiraKey}`
                            : null,
                          () => setOpen(false),
                        )}
                      </p>
                      {n.jiraTitle && (
                        <p className="mt-0.5 line-clamp-2 text-label leading-snug text-text-tertiary">
                          {n.jiraTitle}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
                        <TimeAgo createdAt={n.createdAt} eventAt={n.eventAt} />
                        {n.sprintName && (
                          <span className="inline-flex items-center rounded-md bg-overlay-default px-1.5 py-px text-caption text-text-tertiary leading-tight">
                            {n.sprintName}
                          </span>
                        )}
                        {n.linkUrl && (
                          <a
                            href={n.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-text-secondary transition-colors duration-150"
                            title="Open link"
                          >
                            <ExternalLink size={12} strokeWidth={1.5} />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Right-side actions */}
                    <div className="shrink-0 flex items-center gap-0.5 mt-0.5">
                      {/* Unread dot / mark-read button */}
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => markRead(n.id)}
                          className="group/dot flex h-6 w-6 items-center justify-center rounded-md cursor-pointer hover:bg-hover-interactive transition-colors duration-150"
                          title="Mark as read"
                        >
                          {/* Dot at rest, check on hover */}
                          <span className="block group-hover/dot:hidden h-2 w-2 rounded-full bg-[var(--color-brand-400)]" />
                          <Check size={11} strokeWidth={2.5} className="hidden group-hover/dot:block text-[var(--color-brand-400)]" />
                        </button>
                      )}
                      {/* Dismiss button — always visible on row hover */}
                      <button
                        type="button"
                        onClick={() => dismissOne(n.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-md cursor-pointer text-transparent group-hover:text-text-tertiary hover:!text-text-secondary hover:bg-hover-interactive transition-colors duration-150"
                        title="Dismiss"
                      >
                        <X size={11} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                ))}
                {/* Only show the overflow count when no filter is active — when filtered, all shown results are from the loaded set */}
                {!hasFilter && hiddenCount > 0 && (
                  <div className="border-t border-border-subtle px-4 py-2.5 text-center text-label text-text-muted">
                    {hiddenCount} more notification{hiddenCount === 1 ? "" : "s"} not shown
                  </div>
                )}
              </>
            )}
          </div>
          </Card>
        </div>,
        document.body,
      )}
    </div>
  );
}
