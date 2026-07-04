"use client";

import { useCallback, useState } from "react";
import { Modal } from "@/components/shared/Modal";
import { ModalHeader } from "@/components/shared/ModalHeader";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/shared/Checkbox";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { FileCheck2 } from "lucide-react";
import type { IssueType, JiraStatus, Ticket } from "@/types/ticket";

type ConfirmTicket = Pick<Ticket, "key" | "title" | "type" | "jiraStatus">;

/**
 * Confirm gate before a bulk (re)generate that would sweep in tickets the PO
 * already marked "no test doc needed" (BRDG-463/465). Those are skipped by
 * default; the PO ticks any they still want regenerated (the marking stays).
 * The rest of the selection regenerates either way, so this only lists the
 * marked ones — as regular ticket rows (pill + status + title) with a per-row
 * include checkbox. There is no include-all: opting the whole set back in is
 * rarely what the PO wants.
 */
export function TestDocRegenerateConfirm({
  tickets,
  onCancel,
  onProceed,
}: {
  tickets: ConfirmTicket[];
  onCancel: () => void;
  onProceed: (includeKeys: string[]) => void;
}) {
  const [include, setInclude] = useState<Set<string>>(new Set());
  const toggle = useCallback((key: string) => {
    setInclude((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const count = tickets.length;

  return (
    <Modal open onClose={onCancel} aria-label="Regenerate test documentation">
      <div className="flex max-h-[80vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-2xl">
        <ModalHeader
          icon={<FileCheck2 size={16} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />}
          title={`${count} ticket${count === 1 ? "" : "s"} marked "no test doc needed"`}
          onClose={onCancel}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-body-sm leading-prose text-text-secondary">
            These are left untouched by default. Tick any you still want to regenerate — the marking
            stays. The rest of the selection is regenerated either way.
          </p>
          <ul className="mt-3 flex flex-col gap-0.5">
            {tickets.map((t) => (
              <li
                key={t.key}
                className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-overlay-subtle"
              >
                <div
                  role="checkbox"
                  aria-checked={include.has(t.key)}
                  aria-label={`Regenerate ${t.key} anyway`}
                  tabIndex={0}
                  onClick={() => toggle(t.key)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggle(t.key);
                    }
                  }}
                  className="flex shrink-0 cursor-pointer items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                >
                  <Checkbox checked={include.has(t.key)} />
                </div>
                <TicketStatusPill
                  ticketKey={t.key}
                  jiraStatus={t.jiraStatus as JiraStatus}
                  issueType={t.type as IssueType}
                  title={t.title}
                  variant="list"
                  size="lg"
                  showReadiness={false}
                />
                <span className="min-w-0 flex-1 truncate text-body-lg text-text-primary" title={t.title}>
                  {t.title}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
          <Button variant="ghost" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={() => onProceed([...include])}>
            Continue
          </Button>
        </div>
      </div>
    </Modal>
  );
}
