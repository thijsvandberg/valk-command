"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import Link from "next/link";
import { swrFetcher, sprints, type SprintTestDocs, type SprintTestDocItem } from "@/lib/api-client";
import { getJiraUrl } from "@/lib/jira-url";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import type { IssueType, JiraStatus } from "@/types/ticket";
import type { ShowToast } from "@/hooks/useToast";
import { ClipboardCopy, FileCheck2, Loader2, X } from "lucide-react";

interface SprintTestDocsModalProps {
  sprintId: string;
  onClose: () => void;
  /** Feeds the missing keys into the BRDG-426 generate + validate queue. */
  onGenerateMissing: (keys: string[]) => void;
  /** Opens the single-story review modal for one doc; the host returns to this
   *  bundle (refreshed) when that modal closes. */
  onEditItem: (key: string) => void;
  showToast: ShowToast;
}

/** Split a doc block into its bold title line (if any) and the remainder. */
export function splitDocTitle(doc: string): { title: string | null; body: string } {
  const trimmed = doc.trim();
  const match = trimmed.match(/^\*\*(.+?)\*\*\s*\n?/);
  if (!match) return { title: null, body: trimmed };
  return { title: match[1].trim(), body: trimmed.slice(match[0].length).trim() };
}

// Append the ticket key behind the block's title line as a Jira link (the
// copied document leaves Bridge, so Bridge links would be useless there).
function withJiraKeyLink(doc: string, key: string): string {
  const { title, body } = splitDocTitle(doc);
  const link = `[${key}](${getJiraUrl(key)})`;
  if (title === null) return `${doc.trim()} (${link})`;
  return `**${title}** (${link})${body ? `\n\n${body}` : ""}`;
}

/**
 * Build the copy-pasteable stakeholder document: validated blocks first (big
 * features lead, matching the manual BT-style deliverables), internal
 * one-liners under a Misc header. Every block carries its ticket key behind
 * the title as a Jira link.
 */
export function buildTestDocDocument(data: SprintTestDocs): string {
  const parts: string[] = data.documented
    .filter((d) => d.doc)
    .map((d) => withJiraKeyLink(d.doc!, d.key));
  const internal = data.internal.filter((d) => d.doc).map((d) => withJiraKeyLink(d.doc!, d.key));
  if (internal.length > 0) {
    parts.push(`**Misc**\n\n${internal.join("\n\n")}`);
  }
  return parts.join("\n\n");
}

/** Regular ticket list row, mirroring the sprint board's flat pill (icon +
 *  key + status chip) + title + epic chip. */
function TicketListRow({ item, trailing }: { item: SprintTestDocItem; trailing?: React.ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 py-1">
      <TicketStatusPill
        ticketKey={item.key}
        jiraStatus={item.status as JiraStatus}
        issueType={item.type as IssueType}
        title={item.title}
        variant="list"
        size="lg"
        showReadiness={false}
      />
      <span className="min-w-0 flex-1 truncate text-body-lg text-text-primary" title={item.title}>
        {item.title}
      </span>
      {item.epic && <EpicBadge epic={item.epic} className="max-w-[140px] shrink-0" />}
      {trailing}
    </li>
  );
}

/** In-Bridge key link behind a block title; the COPY uses Jira links instead. */
function BridgeKeyLink({ item }: { item: SprintTestDocItem }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link
        href={`/tickets/${encodeURIComponent(item.key)}`}
        className="font-mono text-caption text-text-muted hover:text-[var(--color-brand-400)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        title="Open in Bridge"
      >
        {item.key}
      </Link>
      {item.needsInput && (
        <span className="rounded bg-[var(--color-status-warning-subtle)] px-1 py-px text-caption font-medium text-[var(--color-status-warning)]">
          needs input
        </span>
      )}
    </span>
  );
}

/**
 * Sprint-level test documentation bundle (BRDG-461): every validated per-story
 * doc in delivery order, the internal one-liners as a Misc tail, and the
 * missing overview so gaps are visible before the sprint is delivered.
 */
export function SprintTestDocsModal({
  sprintId,
  onClose,
  onGenerateMissing,
  onEditItem,
  showToast,
}: SprintTestDocsModalProps) {
  const { data, error } = useSWR<SprintTestDocs>(sprints.testDocsUrl(sprintId), swrFetcher, {
    revalidateOnFocus: false,
  });

  const document = useMemo(() => (data ? buildTestDocDocument(data) : ""), [data]);
  const hasContent = document.trim().length > 0;

  const handleCopy = useCallback(() => {
    if (!hasContent) return;
    navigator.clipboard
      .writeText(document)
      .then(() => showToast("Test document copied to clipboard"))
      .catch(() => showToast("Copy failed — clipboard unavailable"));
  }, [document, hasContent, showToast]);

  const handleGenerateMissing = useCallback(() => {
    if (!data || data.missing.length === 0) return;
    onGenerateMissing(data.missing.map((m) => m.key));
  }, [data, onGenerateMissing]);

  return (
    <Modal open onClose={onClose} aria-label="Sprint test documentation">
      <div className="flex h-[min(880px,90vh)] w-[min(1080px,94vw)] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-500)]/12 ring-1 ring-[var(--color-brand-500)]/20 shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_15%,transparent)]">
              <FileCheck2 size={16} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />
            </div>
            <div className="min-w-0">
              <p className="text-body font-semibold leading-tight text-text-primary">
                Test documentation
              </p>
              <p className="mt-0.5 truncate text-body-sm text-text-tertiary">
                {data?.sprintName ?? "…"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={14} strokeWidth={1.5} />}
            onClick={onClose}
            className="shrink-0 text-text-muted"
            aria-label="Close"
          />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <InlineAlert variant="error">Failed to load test documentation.</InlineAlert>}
          {!data && !error && (
            <div className="flex h-40 items-center justify-center text-text-muted">
              <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
            </div>
          )}
          {data && (
            <div className="flex flex-col gap-4">
              {/* Missing overview first: the gap list is what blocks delivery. */}
              {data.missing.length > 0 && (
                <div
                  data-testid="test-docs-missing"
                  className="rounded-xl border border-[var(--color-status-warning)]/25 bg-[var(--color-status-warning-subtle)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-body-sm font-medium text-[var(--color-status-warning)]">
                      {data.missing.length} finished {data.missing.length === 1 ? "story misses" : "stories miss"} test documentation
                    </p>
                    <Button variant="secondary" size="sm" onClick={handleGenerateMissing}>
                      Generate missing ({data.missing.length})
                    </Button>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1">
                    {data.missing.map((m) => (
                      <TicketListRow
                        key={m.key}
                        item={m}
                        trailing={
                          m.hasDraft ? (
                            <>
                              <span className="shrink-0 rounded bg-[var(--color-status-warning-subtle)] px-1.5 py-px text-caption font-medium text-[var(--color-status-warning)]">
                                draft ready
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => onEditItem(m.key)}>
                                Review
                              </Button>
                            </>
                          ) : undefined
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}

              {data.documented.length === 0 && data.internal.length === 0 && (
                <p className="py-8 text-center text-body-lg text-text-muted">
                  No test documentation saved for this sprint yet.
                </p>
              )}

              {data.documented.map((item) => {
                const { title, body } = splitDocTitle(item.doc ?? "");
                return (
                  <div
                    key={item.key}
                    data-testid="test-docs-block"
                    className="rounded-xl border border-border-subtle bg-surface-base p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-semibold text-text-primary">{title ?? item.title}</span>
                      <BridgeKeyLink item={item} />
                      <button
                        type="button"
                        onClick={() => onEditItem(item.key)}
                        className="ml-auto cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium text-text-tertiary hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                        title="Open this doc in the review modal; you return here when done"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="description-content">{renderMarkdown(title === null ? item.doc ?? "" : body)}</div>
                  </div>
                );
              })}

              {data.internal.length > 0 && (
                <div data-testid="test-docs-misc" className="rounded-xl border border-border-subtle bg-surface-base p-4">
                  <p className="mb-2 text-body font-semibold text-text-primary">Misc</p>
                  <div className="flex flex-col gap-3">
                    {data.internal.map((item) => {
                      const { title, body } = splitDocTitle(item.doc ?? "");
                      return (
                        <div key={item.key}>
                          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="font-semibold text-text-primary">{title ?? item.title}</span>
                            <BridgeKeyLink item={item} />
                            <button
                              type="button"
                              onClick={() => onEditItem(item.key)}
                              className="ml-auto cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium text-text-tertiary hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                              title="Open this doc in the review modal; you return here when done"
                            >
                              Edit
                            </button>
                          </div>
                          <div className="description-content">{renderMarkdown(title === null ? item.doc ?? "" : body)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.notNeeded.length > 0 && (
                <div data-testid="test-docs-not-needed" className="rounded-xl border border-border-subtle bg-surface-base p-3">
                  <p className="text-body-sm font-medium text-text-secondary">
                    No test documentation needed ({data.notNeeded.length})
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {data.notNeeded.map((m) => (
                      <TicketListRow key={m.key} item={m} />
                    ))}
                  </ul>
                </div>
              )}

              {/* Not in DONE/Test yet, so not counted as missing — but the PO
                  decides what ships: an unfinished story that goes along in the
                  delivery gets its doc via the per-row Generate. */}
              {data.other.length > 0 && (
                <div data-testid="test-docs-other" className="rounded-xl border border-border-subtle bg-surface-base p-3">
                  <p className="text-body-sm font-medium text-text-secondary">
                    Not finished yet ({data.other.length}) — generate anyway if it ships with this delivery
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {data.other.map((m) => (
                      <TicketListRow
                        key={m.key}
                        item={m}
                        trailing={
                          <Button variant="ghost" size="sm" onClick={() => onGenerateMissing([m.key])}>
                            Generate
                          </Button>
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
          <Button variant="ghost" size="md" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleCopy}
            disabled={!hasContent}
            icon={<ClipboardCopy size={12} strokeWidth={2} />}
          >
            Copy document
          </Button>
        </div>
      </div>
    </Modal>
  );
}
