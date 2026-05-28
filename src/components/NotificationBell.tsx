"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { useNotifications } from "@/hooks/usePipelines";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";
import { TimeAgo } from "@/components/notifications/TimeAgo";
import { renderMessage, notificationIcon, typeLabel, extractTeamPrefix } from "@/components/notifications/notification-utils";

export function NotificationBell() {
  const { notifications, unreadCount, subscribedUnreadCount, subscribedTeams, totalCount, markRead, markAllRead, clearRead, dismissOne, markFilteredRead, clearFiltered } = useNotifications(50);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeTeams, setActiveTeams] = useState<Set<string> | null>(null);

  const hasSubscriptions = subscribedTeams.length > 0;
  const badgeCount = hasSubscriptions ? subscribedUnreadCount : unreadCount;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const DROPDOWN_WIDTH = 360;

  const computePos = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    // Align right edge of dropdown with right edge of button, but clamp so it stays on-screen
    const idealLeft = rect.right - DROPDOWN_WIDTH;
    const clampedLeft = Math.max(8, Math.min(idealLeft, window.innerWidth - DROPDOWN_WIDTH - 8));
    setDropdownPos({
      top: rect.bottom + 8,
      left: clampedLeft,
    });
  }, []);

  function handleToggle() {
    if (!open) {
      computePos();
      // Default team filter to subscribed teams when opening
      if (hasSubscriptions) {
        setActiveTeams(new Set(subscribedTeams));
      }
    }
    if (open) {
      setActiveType(null);
      setActiveTeams(null);
    }
    setOpen((v) => !v);
  }

  const handleCloseDropdown = useCallback(() => {
    setOpen(false);
    setActiveType(null);
    setActiveTeams(null);
  }, []);

  useOutsideClick([buttonRef, dropdownRef], handleCloseDropdown, { enabled: open });

  useEffect(() => {
    if (!open) return;
    function handleResize() { computePos(); }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open, computePos]);

  // Derive per-type counts, per-team counts, and the filtered list from loaded notifications.
  // effectiveType/Team auto-clears when the active filter type or team has no more notifications.
  const { typeCounts, teamCounts, filteredNotifications, filteredUnreadIds, filteredReadIds, effectiveType, effectiveTeams } = useMemo(() => {
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

    const effectiveType = activeType && typeCounts.has(activeType) ? activeType : null;
    // Multi-select team filter: prune to teams that still have notifications
    let effectiveTeams: Set<string> | null = null;
    if (activeTeams) {
      const pruned = new Set([...activeTeams].filter((t) => teamCounts.has(t)));
      if (pruned.size > 0) effectiveTeams = pruned;
    }

    const filtered = notifications.filter((n) => {
      if (effectiveType && n.type !== effectiveType) return false;
      if (effectiveTeams) {
        const team = extractTeamPrefix(n.sprintName);
        if (!team || !effectiveTeams.has(team)) return false;
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
      effectiveTeams,
    };
  }, [notifications, activeType, activeTeams]);

  const hasFilter = effectiveType !== null || effectiveTeams !== null;

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
        aria-label={`Notifications${badgeCount > 0 ? ` (${badgeCount} unread)` : ""}`}
        className="relative border-0 bg-transparent"
        icon={
          <>
            <Bell size={16} strokeWidth={1.5} />
            {badgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-caption font-bold text-white tabular-nums shadow-[0_2px_6px_rgba(239,68,68,0.4)]">
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
          </>
        }
      />

      {/* Dropdown portal — rendered on document.body to escape any stacking context */}
      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: "var(--z-notification)" }}
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

              {/* Team chips (multi-select) */}
              {teamCounts.size > 1 && [...teamCounts.entries()].map(([team, { unread }]) => {
                const isActive = effectiveTeams?.has(team) ?? false;
                const isSubscribed = subscribedTeams.includes(team);
                return (
                  <button
                    key={team}
                    type="button"
                    onClick={() => {
                      setActiveTeams((prev) => {
                        const next = new Set(prev ?? []);
                        if (next.has(team)) next.delete(team);
                        else next.add(team);
                        return next.size > 0 ? next : null;
                      });
                    }}
                    aria-pressed={isActive}
                    aria-label={`Team ${team}${unread > 0 ? `: ${unread} unread` : ""}${isSubscribed ? " (subscribed)" : ""}`}
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
