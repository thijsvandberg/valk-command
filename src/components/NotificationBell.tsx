"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { useNotifications } from "@/hooks/usePipelines";
import { Button } from "@/components/ui/Button";

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

function TimeAgo({ iso }: { iso: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<"above" | "below">("above");
  const ref = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      // Show above unless there's not enough room
      setPos(rect.top > 60 ? "above" : "below");
    }
    setVisible(true);
  };

  return (
    <span
      ref={ref}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      <span className="text-[10px] text-white/20 tabular-nums cursor-default select-none">
        {formatTimeAgo(iso)}
      </span>
      {visible && (
        <span
          className={`pointer-events-none absolute left-0 z-50 whitespace-nowrap rounded-md border border-white/[0.08] bg-[#1a1d23] px-2.5 py-1.5 text-[11px] text-white/70 shadow-[0_4px_16px_rgba(0,0,0,0.5)] ${
            pos === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {formatExactTime(iso)}
        </span>
      )}
    </span>
  );
}

function renderMessage(
  message: string,
  jiraKey: string | null,
  onLinkClick: () => void,
): React.ReactNode {
  if (!jiraKey || !message.includes(jiraKey)) return message;
  const idx = message.indexOf(jiraKey);
  return (
    <>
      {message.slice(0, idx)}
      <Link
        href={`/tickets/${jiraKey}`}
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
      return <Info size={13} strokeWidth={1.5} className="text-white/40" />;
    default:
      return <Bell size={13} strokeWidth={1.5} className="text-white/30" />;
  }
}

// 5 seconds after the panel opens, mark all currently-visible unread notifications as read
const AUTO_MARK_READ_DELAY = 5000;

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications(20);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const autoMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Auto-mark unread notifications as read after 5 seconds of panel being open
  const scheduleAutoMarkRead = useCallback(() => {
    if (autoMarkTimerRef.current) clearTimeout(autoMarkTimerRef.current);
    autoMarkTimerRef.current = setTimeout(() => {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length === 0) return;
      // Mark each visible unread notification as read
      Promise.all(unreadIds.map((id) => markRead(id))).catch(() => {});
    }, AUTO_MARK_READ_DELAY);
  }, [notifications, markRead]);

  useEffect(() => {
    if (open && unreadCount > 0) {
      scheduleAutoMarkRead();
    }
    return () => {
      if (autoMarkTimerRef.current) clearTimeout(autoMarkTimerRef.current);
    };
  }, [open, unreadCount, scheduleAutoMarkRead]);

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-white/30 cursor-pointer hover:bg-white/[0.04] hover:text-white/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell size={16} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums shadow-[0_2px_6px_rgba(239,68,68,0.4)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[360px] rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <span className="font-[var(--font-display)] text-[13px] font-semibold text-white/70">
              Notifications
            </span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<CheckCheck size={12} strokeWidth={1.5} />}
                  onClick={() => markAllRead()}
                >
                  Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={12} strokeWidth={1.5} />}
                  onClick={() => clearAll()}
                >
                  Clear all
                </Button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-white/25">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`group flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] last:border-b-0 transition-colors duration-150 hover:bg-white/[0.02] ${
                    !n.read ? "bg-[var(--color-brand-500)]/[0.04]" : ""
                  }`}
                >
                  {/* Icon */}
                  <div className="mt-0.5 shrink-0">{notificationIcon(n.type)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-white/65 leading-relaxed">
                      {renderMessage(n.message, n.jiraKey, () => setOpen(false))}
                    </p>
                    {n.jiraTitle && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/35">
                        {n.jiraTitle}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
                      <TimeAgo iso={n.createdAt} />
                      {n.type === "story-writer" && n.jiraKey && (
                        <Link
                          href={`/tickets/${n.jiraKey}/write`}
                          onClick={() => setOpen(false)}
                          className="text-[10px] text-white/30 hover:text-[var(--color-brand-400)] transition-colors duration-150"
                        >
                          Open story writer
                        </Link>
                      )}
                      {n.linkUrl && (
                        <a
                          href={n.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/15 hover:text-white/40 transition-colors duration-150"
                        >
                          <ExternalLink size={10} strokeWidth={1.5} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Unread dot + mark read */}
                  <div className="shrink-0 flex items-center gap-1">
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="flex h-5 w-5 items-center justify-center rounded-md cursor-pointer hover:bg-white/[0.06] transition-colors duration-150"
                        title="Mark as read"
                      >
                        <span className="h-2 w-2 rounded-full bg-[var(--color-brand-400)]" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
