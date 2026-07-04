"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Modal } from "@/components/shared/Modal";
import { ModalHeader } from "@/components/shared/ModalHeader";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { Tag } from "@/components/shared/Tag";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { CaptionButton } from "@/components/sprint-board/CaptionButton";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import Link from "next/link";
import { swrFetcher, sprints, tickets as ticketsApi, ApiError, type SprintTestDocs, type SprintTestDocItem } from "@/lib/api-client";
import { invalidateTestDocCache } from "@/lib/test-doc-prefetch";
import { getJiraUrl } from "@/lib/jira-url";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import type { IssueType, JiraStatus } from "@/types/ticket";
import type { ShowToast } from "@/hooks/useToast";
import { ClipboardCopy, FileCheck2 } from "lucide-react";

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

/** One eyebrow style for every bundle section so the groups share a rhythm. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">{children}</p>
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
      {item.needsInput && <Tag color="amber">needs input</Tag>}
    </span>
  );
}

/**
 * Per-row actions on the gap lists (missing / not-finished): open the story in
 * the review popup, generate + review it, or skip it (mark "no test doc
 * needed") straight from the bundle, without opening the full-screen queue.
 */
function RowActions({
  item,
  onOpen,
  onGenerate,
  onSkip,
  skipping,
}: {
  item: SprintTestDocItem;
  onOpen: (key: string) => void;
  onGenerate: (key: string) => void;
  onSkip: (key: string) => void;
  skipping: boolean;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {item.hasDraft && <Tag color="amber" className="shrink-0">draft ready</Tag>}
      <CaptionButton onClick={() => onOpen(item.key)} title="Open this story in the review popup">
        Open
      </CaptionButton>
      <CaptionButton onClick={() => onGenerate(item.key)} title="Generate the doc and review it">
        Generate
      </CaptionButton>
      <CaptionButton
        onClick={() => onSkip(item.key)}
        disabled={skipping}
        title="Mark as needing no test documentation — moves it out of the delivery gap"
      >
        Skip
      </CaptionButton>
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
  const { mutate } = useSWRConfig();
  const [skippingKeys, setSkippingKeys] = useState<Set<string>>(new Set());

  // Skip = the Bridge-only "no test documentation needed" marker (same as the
  // review popup's button). Mark it, then refresh this bundle so the row moves
  // to the notNeeded list, plus the board lists so the row marker follows.
  const handleSkip = useCallback(
    async (key: string) => {
      setSkippingKeys((prev) => new Set(prev).add(key));
      try {
        await ticketsApi.markTestDocNotNeeded(key);
        invalidateTestDocCache(key);
        await mutate(sprints.testDocsUrl(sprintId));
        void mutate((k) => typeof k === "string" && k.startsWith("/api/tickets"));
        showToast(`${key} marked as no test documentation needed`);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : `Could not skip ${key}`);
      } finally {
        setSkippingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [mutate, sprintId, showToast],
  );

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
        <ModalHeader
          icon={<FileCheck2 size={16} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />}
          title="Test documentation"
          subtitle={
            <p className="mt-0.5 truncate text-body-sm text-text-tertiary">
              {data?.sprintName ?? "…"}
            </p>
          }
          onClose={onClose}
        />

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <InlineAlert variant="error">Failed to load test documentation.</InlineAlert>}
          {!data && !error && (
            <LoadingState variant="spinner" label="Loading test documentation…" className="h-40" />
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
                          <RowActions
                            item={m}
                            onOpen={onEditItem}
                            onGenerate={(k) => onGenerateMissing([k])}
                            onSkip={handleSkip}
                            skipping={skippingKeys.has(m.key)}
                          />
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}

              {data.documented.length === 0 && data.internal.length === 0 && (
                <EmptyState
                  className="py-8"
                  icon={<FileCheck2 size={20} strokeWidth={1.75} className="text-text-muted" />}
                  title="No test documentation saved for this sprint yet."
                />
              )}

              {data.documented.length > 0 && (
                <section className="flex flex-col gap-2.5">
                  <SectionLabel>Documented ({data.documented.length})</SectionLabel>
                  {data.documented.map((item) => {
                    const { title, body } = splitDocTitle(item.doc ?? "");
                    return (
                      <div
                        key={item.key}
                        data-testid="test-docs-block"
                        className="rounded-xl border border-border-default bg-surface-base p-4 shadow-[0_1px_3px_color-mix(in_srgb,var(--color-brand-600)_8%,transparent)]"
                      >
                        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border-subtle pb-2">
                          <span className="text-body-lg font-semibold text-text-primary">{title ?? item.title}</span>
                          <BridgeKeyLink item={item} />
                          <CaptionButton
                            onClick={() => onEditItem(item.key)}
                            className="ml-auto"
                            title="Open this doc in the review modal; you return here when done"
                          >
                            Edit
                          </CaptionButton>
                        </div>
                        <div className="description-content">{renderMarkdown(title === null ? item.doc ?? "" : body)}</div>
                      </div>
                    );
                  })}
                </section>
              )}

              {data.internal.length > 0 && (
                <div data-testid="test-docs-misc" className="rounded-xl border border-border-default bg-surface-base p-4 shadow-[0_1px_3px_color-mix(in_srgb,var(--color-brand-600)_8%,transparent)]">
                  <div className="mb-2.5 border-b border-border-subtle pb-2">
                    <SectionLabel>Misc ({data.internal.length})</SectionLabel>
                  </div>
                  <div className="flex flex-col gap-3">
                    {data.internal.map((item) => {
                      const { title, body } = splitDocTitle(item.doc ?? "");
                      return (
                        <div key={item.key}>
                          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="font-semibold text-text-primary">{title ?? item.title}</span>
                            <BridgeKeyLink item={item} />
                            <CaptionButton
                              onClick={() => onEditItem(item.key)}
                              className="ml-auto"
                              title="Open this doc in the review modal; you return here when done"
                            >
                              Edit
                            </CaptionButton>
                          </div>
                          <div className="description-content">{renderMarkdown(title === null ? item.doc ?? "" : body)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.notNeeded.length > 0 && (
                <div data-testid="test-docs-not-needed" className="rounded-xl border border-border-subtle bg-surface-base/60 p-3.5">
                  <SectionLabel>No test documentation needed ({data.notNeeded.length})</SectionLabel>
                  <ul className="mt-2.5 flex flex-col gap-1">
                    {data.notNeeded.map((m) => (
                      <TicketListRow key={m.key} item={m} />
                    ))}
                  </ul>
                </div>
              )}

              {/* Not in DONE/Test yet, so not counted as missing — but the PO
                  decides what ships: an unfinished story that goes along in the
                  delivery gets its doc via the per-row actions. */}
              {data.other.length > 0 && (
                <div data-testid="test-docs-other" className="rounded-xl border border-border-subtle bg-surface-base/60 p-3.5">
                  <SectionLabel>Not finished yet ({data.other.length})</SectionLabel>
                  <p className="mt-1 text-body-sm text-text-muted">
                    Generate anyway if it ships with this delivery.
                  </p>
                  <ul className="mt-2.5 flex flex-col gap-1">
                    {data.other.map((m) => (
                      <TicketListRow
                        key={m.key}
                        item={m}
                        trailing={
                          <RowActions
                            item={m}
                            onOpen={onEditItem}
                            onGenerate={(k) => onGenerateMissing([k])}
                            onSkip={handleSkip}
                            skipping={skippingKeys.has(m.key)}
                          />
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
