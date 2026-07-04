"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Modal } from "@/components/shared/Modal";
import { ModalHeader } from "@/components/shared/ModalHeader";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { Tag } from "@/components/shared/Tag";
import { Checkbox } from "@/components/shared/Checkbox";
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
export function buildTestDocDocument(
  documented: SprintTestDocItem[],
  internal: SprintTestDocItem[],
): string {
  const parts: string[] = documented
    .filter((d) => d.doc)
    .map((d) => withJiraKeyLink(d.doc!, d.key));
  const internalParts = internal.filter((d) => d.doc).map((d) => withJiraKeyLink(d.doc!, d.key));
  if (internalParts.length > 0) {
    parts.push(`**Misc**\n\n${internalParts.join("\n\n")}`);
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
 * One rendered doc block. Shared by the auto-included Documented cards, the
 * lighter Misc entries (`variant="misc"`), and the opt-in "not finished yet"
 * blocks (BRDG-465): `provisional` flags a ticked-but-unfinished story with a
 * subtle tag + dashed border so the PO can tell it apart from a shipped
 * deliverable in the preview.
 */
function TestDocBlock({
  item,
  onEditItem,
  variant = "card",
  provisional = false,
}: {
  item: SprintTestDocItem;
  onEditItem: (key: string) => void;
  variant?: "card" | "misc";
  provisional?: boolean;
}) {
  const { title, body } = splitDocTitle(item.doc ?? "");
  const isCard = variant === "card";
  const header = (
    <div
      className={
        isCard
          ? "mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border-subtle pb-2"
          : "mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1"
      }
    >
      <span className={isCard ? "text-body-lg font-semibold text-text-primary" : "font-semibold text-text-primary"}>
        {title ?? item.title}
      </span>
      <BridgeKeyLink item={item} />
      {provisional && <Tag color="neutral">not finished yet</Tag>}
      <CaptionButton
        onClick={() => onEditItem(item.key)}
        className="ml-auto"
        title="Open this doc in the review modal; you return here when done"
      >
        Edit
      </CaptionButton>
    </div>
  );
  const content = (
    <div className="description-content">{renderMarkdown(title === null ? item.doc ?? "" : body)}</div>
  );
  if (!isCard) {
    return (
      <div>
        {header}
        {content}
      </div>
    );
  }
  return (
    <div
      data-testid="test-docs-block"
      className={`rounded-xl border bg-surface-base p-4 shadow-[0_1px_3px_color-mix(in_srgb,var(--color-brand-600)_8%,transparent)] ${
        provisional ? "border-dashed border-[var(--color-brand-400)]/40" : "border-border-default"
      }`}
    >
      {header}
      {content}
    </div>
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
  // Not-finished stories with a doc are opt-in for the delivery document: the PO
  // ticks the ones that ship with this delivery (BRDG-465). Ephemeral, per
  // modal session; a stale key self-heals because rendering intersects it with
  // the current `other` list.
  const [selectedUnfinished, setSelectedUnfinished] = useState<Set<string>>(new Set());
  const toggleUnfinished = useCallback((key: string) => {
    setSelectedUnfinished((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  // Ticked not-finished docs fold into the Documented / Misc lists (mirroring the
  // finished internal-vs-documented split) so the preview and the copy match.
  const selectedOther = useMemo(
    () => (data ? data.other.filter((o) => o.doc && selectedUnfinished.has(o.key)) : []),
    [data, selectedUnfinished],
  );
  const documentedAll = useMemo(
    () => [...(data?.documented ?? []), ...selectedOther.filter((o) => !o.internalDoc)],
    [data, selectedOther],
  );
  const internalAll = useMemo(
    () => [...(data?.internal ?? []), ...selectedOther.filter((o) => o.internalDoc)],
    [data, selectedOther],
  );

  const document = useMemo(
    () => buildTestDocDocument(documentedAll, internalAll),
    [documentedAll, internalAll],
  );
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

              {documentedAll.length === 0 && internalAll.length === 0 && (
                <EmptyState
                  className="py-8"
                  icon={<FileCheck2 size={20} strokeWidth={1.75} className="text-text-muted" />}
                  title="No test documentation saved for this sprint yet."
                />
              )}

              {documentedAll.length > 0 && (
                <section className="flex flex-col gap-2.5">
                  <SectionLabel>Documented ({documentedAll.length})</SectionLabel>
                  {documentedAll.map((item) => (
                    <TestDocBlock
                      key={item.key}
                      item={item}
                      onEditItem={onEditItem}
                      provisional={selectedUnfinished.has(item.key)}
                    />
                  ))}
                </section>
              )}

              {internalAll.length > 0 && (
                <div data-testid="test-docs-misc" className="rounded-xl border border-border-default bg-surface-base p-4 shadow-[0_1px_3px_color-mix(in_srgb,var(--color-brand-600)_8%,transparent)]">
                  <div className="mb-2.5 border-b border-border-subtle pb-2">
                    <SectionLabel>Misc ({internalAll.length})</SectionLabel>
                  </div>
                  <div className="flex flex-col gap-3">
                    {internalAll.map((item) => (
                      <TestDocBlock
                        key={item.key}
                        item={item}
                        onEditItem={onEditItem}
                        variant="misc"
                        provisional={selectedUnfinished.has(item.key)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {data.notNeeded.length > 0 && (
                <div data-testid="test-docs-not-needed" className="rounded-xl border border-border-subtle bg-surface-base/60 p-3.5">
                  <SectionLabel>No test documentation needed ({data.notNeeded.length})</SectionLabel>
                  <ul className="mt-2.5 flex flex-col gap-1">
                    {data.notNeeded.map((m) => (
                      <TicketListRow
                        key={m.key}
                        item={m}
                        trailing={
                          <CaptionButton
                            className="shrink-0"
                            onClick={() => onEditItem(m.key)}
                            title="Open this story in the review popup to still write a doc"
                          >
                            Open
                          </CaptionButton>
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* Not in DONE/Test yet, so not counted as missing — but the PO
                  decides what ships: generate a doc, then tick the story to fold
                  it into the delivery document (BRDG-465). */}
              {data.other.length > 0 && (
                <div data-testid="test-docs-other" className="rounded-xl border border-border-subtle bg-surface-base/60 p-3.5">
                  <SectionLabel>Not finished yet ({data.other.length})</SectionLabel>
                  <p className="mt-1 text-body-sm text-text-muted">
                    Ships with this delivery? Generate a doc, then tick it to include it in the document.
                  </p>
                  <ul className="mt-2.5 flex flex-col gap-1">
                    {data.other.map((m) => (
                      <TicketListRow
                        key={m.key}
                        item={m}
                        trailing={
                          <span className="flex shrink-0 items-center gap-1.5">
                            {m.doc && (
                              <div
                                role="checkbox"
                                aria-checked={selectedUnfinished.has(m.key)}
                                aria-label={`Include ${m.key} in the document`}
                                tabIndex={0}
                                onClick={() => toggleUnfinished(m.key)}
                                onKeyDown={(e) => {
                                  if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault();
                                    toggleUnfinished(m.key);
                                  }
                                }}
                                className="flex cursor-pointer items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                              >
                                <Checkbox checked={selectedUnfinished.has(m.key)} />
                              </div>
                            )}
                            <RowActions
                              item={m}
                              onOpen={onEditItem}
                              onGenerate={(k) => onGenerateMissing([k])}
                              onSkip={handleSkip}
                              skipping={skippingKeys.has(m.key)}
                            />
                          </span>
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
