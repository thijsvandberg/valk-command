"use client";

import type { Ticket } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";

interface DragGhostOverlayProps {
  dragTicket: Ticket;
  draggedKeys: string[];
  tickets: Ticket[];
  targetSprintId: string | null;
  sprintNameMap: Record<string, string>;
}

export function DragGhostOverlay({ dragTicket, draggedKeys, tickets, targetSprintId, sprintNameMap }: DragGhostOverlayProps) {
  const isMulti = draggedKeys.length > 1;
  const draggedTickets = isMulti
    ? draggedKeys.map((k) => tickets.find((t) => t.key === k)).filter(Boolean)
    : [dragTicket];

  return (
    <div style={{ opacity: 0.92 }} className="inline-block w-max">
      <div className="relative">
        {isMulti && (
          <>
            <div className="absolute inset-0 translate-y-1.5 translate-x-1.5 rounded-lg border border-border-subtle bg-surface-elevated" style={{ opacity: 0.4 }} />
            <div className="absolute inset-0 translate-y-[5px] translate-x-[5px] rounded-lg border border-border-subtle bg-surface-elevated" style={{ opacity: 0.2 }} />
          </>
        )}
        <div className={`relative rounded-lg border bg-surface-elevated shadow-lg ${isMulti ? "border-[var(--color-brand-500)]/30" : "border-[var(--color-brand-500)]/20"}`}>
          {isMulti && (
            <div className="absolute -top-2.5 -right-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-1.5 text-label font-semibold text-white shadow-sm">
              {draggedKeys.length}
            </div>
          )}
          <div className="px-3 py-2 space-y-0.5">
            {draggedTickets.slice(0, 5).map((t) => (
              <div key={t!.key} className="flex items-center gap-2 text-body-lg">
                <IssueTypeIcon type={t!.type} />
                <span className="font-mono text-body-sm text-text-tertiary">{t!.key}</span>
                <span className="max-w-52 truncate text-text-secondary">{t!.title}</span>
              </div>
            ))}
            {draggedTickets.length > 5 && (
              <div className="text-body-sm text-text-muted pl-0.5">
                and {draggedTickets.length - 5} more...
              </div>
            )}
          </div>
        </div>
      </div>
      {targetSprintId && (
        <div className="mt-1.5 rounded-md border border-[var(--color-brand-500)]/30 bg-surface-elevated px-2 py-1 text-label text-[var(--color-brand-300)]">
          Move to {sprintNameMap[targetSprintId] ?? targetSprintId}
        </div>
      )}
    </div>
  );
}
