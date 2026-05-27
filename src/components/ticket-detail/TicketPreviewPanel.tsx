"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import Link from "next/link";
import { X, ArrowUpRight, Loader2, PenLine } from "lucide-react";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";

const PANEL_STORAGE_KEY = "ticketPreviewPanelWidth";
const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 340;

function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      elements.push(<h3 key={`h-${i}`} className="mt-4 mb-1 font-[var(--font-display)] text-body-lg font-semibold text-text-primary">{line.slice(3)}</h3>);
    } else if (line.startsWith("### ")) {
      elements.push(<h4 key={`h4-${i}`} className="mt-3 mb-1 text-body-sm font-semibold text-text-secondary">{line.slice(4)}</h4>);
    } else if (line.startsWith("- ")) {
      elements.push(<li key={`li-${i}`} className="ml-4 list-disc text-body-sm text-text-secondary">{line.slice(2)}</li>);
    } else if (/^\d+\. /.test(line)) {
      elements.push(<li key={`ol-${i}`} className="ml-4 list-decimal text-body-sm text-text-secondary">{line.replace(/^\d+\.\s*/, "")}</li>);
    } else if (line.trim() === "") {
      elements.push(<div key={`br-${i}`} className="h-1.5" />);
    } else {
      elements.push(<p key={`p-${i}`} className="text-body-sm leading-relaxed text-text-secondary">{line}</p>);
    }
  }
  return elements;
}

export function TicketPreviewPanel({
  ticketKey,
  onClose,
}: {
  ticketKey: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useTicketDetail(ticketKey);

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!saved) return DEFAULT_WIDTH;
    const parsed = parseInt(saved, 10);
    return !isNaN(parsed) ? Math.max(MIN_WIDTH, parsed) : DEFAULT_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      const newWidth = Math.max(MIN_WIDTH, window.innerWidth - e.clientX);
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

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        style={{ transition: "opacity 0.15s ease" }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 z-50 flex h-full flex-col border-l border-border-default bg-[var(--color-surface-elevated)] shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
        style={{ width: `${panelWidth}px`, minWidth: MIN_WIDTH }}
      >
        {/* Resize drag handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
          style={isDragging ? { backgroundColor: "rgba(46, 145, 73, 0.5)" } : {}}
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
          <div className="flex items-center gap-2.5">
            {data && <IssueTypeIcon type={data.type} />}
            <span className="font-mono text-body-lg font-medium text-text-secondary">
              {ticketKey}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={`/tickets/${ticketKey}/write`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary cursor-pointer bg-overlay-subtle border border-border-default hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150"
              title="Write story"
            >
              <PenLine className="h-3.5 w-3.5" strokeWidth={1.5} />
            </a>
            <a
              href={`/tickets/${ticketKey}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary cursor-pointer bg-overlay-subtle border border-border-default hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150"
              title="Open full page"
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
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} strokeWidth={1.5} className="animate-spin text-text-muted" />
            </div>
          )}

          {data && (
            <>
              <h2 className="font-[var(--font-display)] text-heading font-semibold leading-snug text-text-primary">
                {data.title}
              </h2>

              {/* Status + metadata */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge status={data.jiraStatus} />
                {data.storyPoints !== undefined && data.storyPoints !== null && (
                  <span className="inline-flex items-center rounded-md bg-overlay-default px-2 py-0.5 text-body-sm font-medium text-text-secondary">
                    {data.storyPoints} pts
                  </span>
                )}
              </div>

              {/* Assignee */}
              {data.assignee && (
                <div className="mt-4 flex items-center gap-2.5">
                  <Avatar assignee={data.assignee} />
                  <span className="text-body-lg text-text-secondary">
                    {data.assignee.name}
                  </span>
                </div>
              )}

              {/* Description */}
              <div className="my-5 h-px bg-overlay-default" />
              <h3 className="text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">Description</h3>
              <div className="mt-2">
                {data.description ? (
                  <div className="max-h-[50vh] overflow-y-auto">
                    {renderSimpleMarkdown(data.description)}
                  </div>
                ) : (
                  <p className="text-body-sm text-text-muted">No description</p>
                )}
              </div>

              {/* Subtasks of this ticket */}
              {data.subtasks && data.subtasks.length > 0 && (
                <>
                  <div className="my-5 h-px bg-overlay-default" />
                  <h3 className="text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">
                    Subtasks
                    <span className="ml-1.5 text-text-muted">({data.subtasks.length})</span>
                  </h3>
                  <div className="mt-2 space-y-1">
                    {data.subtasks.map((sub) => (
                      <div key={sub.key} className="flex items-center gap-2 text-body-sm">
                        <StatusBadge status={sub.jiraStatus} />
                        <span className="truncate text-text-secondary">{sub.title}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Open full page link */}
              <div className="my-5 h-px bg-overlay-default" />
              <Link
                href={`/tickets/${ticketKey}`}
                className="flex items-center gap-2 text-body-sm text-[var(--color-brand-400)] cursor-pointer hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                style={{ transition: "color 0.15s ease, transform 0.1s ease" }}
              >
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                Open full ticket detail
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
