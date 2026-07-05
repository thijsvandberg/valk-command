"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
import { swrFetcher, sprints, tickets as ticketsApi, ApiError, type SprintTestDocs, type SprintTestDocItem } from "@/lib/api-client";
import { invalidateTestDocCache } from "@/lib/test-doc-prefetch";
import { registerPendingEdit, confirmPendingEdit, clearPendingEdit } from "@/components/sprint-board/pendingTicketEdits";
import { patchTicketDetailCache } from "@/lib/ticket-cache";
import { getJiraUrl } from "@/lib/jira-url";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import { AnchoredPanel } from "@/components/shared/AnchoredPanel";
import { MenuList, MenuItem } from "@/components/shared/MenuItem";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { buildTicketHoverData } from "@/lib/ticket-hover";
import type { TicketDetailResponse } from "@/lib/ticket-detail-builder";
import type { IssueType, JiraStatus } from "@/types/ticket";
import type { ShowToast } from "@/hooks/useToast";
import { ClipboardCopy, FileCheck2, MoreHorizontal, Sparkles, CircleSlash, RefreshCw, SquarePen } from "lucide-react";

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

/** Split a doc block into its bold title line (if any) and the remainder.
 *  Only a first line that is ENTIRELY bold counts as a title: a bold lead-in
 *  with trailing text ("**Cleanup**: legacy endpoint …") stays in the body,
 *  otherwise both the preview heading and the copied document would tear the
 *  line in half. */
export function splitDocTitle(doc: string): { title: string | null; body: string } {
  const trimmed = doc.trim();
  const match = trimmed.match(/^\*\*(.+?)\*\*[ \t]*(\n|$)/);
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
 *
 * Draft-only blocks (BRDG-473) are dropped unless `includeDrafts` is set: the
 * preview always shows them (tagged draft), but a plain copy stays limited to
 * validated content unless the PO opts drafts in.
 */
export function buildTestDocDocument(
  documented: SprintTestDocItem[],
  internal: SprintTestDocItem[],
  includeDrafts = false,
): string {
  const keep = (d: SprintTestDocItem) => Boolean(d.doc) && (includeDrafts || !d.isDraft);
  const parts: string[] = documented.filter(keep).map((d) => withJiraKeyLink(d.doc!, d.key));
  const internalParts = internal.filter(keep).map((d) => withJiraKeyLink(d.doc!, d.key));
  if (internalParts.length > 0) {
    parts.push(`**Misc**\n\n${internalParts.join("\n\n")}`);
  }
  return parts.join("\n\n");
}

/**
 * The regular board pill (issue-type icon + key + status) with the standard
 * hover card, used everywhere in this modal (block titles + gap-list rows) so a
 * ticket reference behaves the same here as on the board. Status/type/title
 * paint immediately from the bundle payload; each pill fetches its own ticket on
 * demand — server-cached and deduped, mirroring TicketRefPill — so the hover
 * card fills in without blocking the first render.
 */
function TestDocTicketPill({
  item,
  variant,
  size = "lg",
}: {
  item: SprintTestDocItem;
  variant?: "list";
  size?: "sm" | "md" | "lg";
}) {
  const { data } = useSWR<TicketDetailResponse>(ticketsApi.detailUrl(item.key), swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    shouldRetryOnError: false,
  });
  const { sprints: jiraSprints } = useJiraSprints();
  const sprintNames = useMemo(() => {
    const m: Record<string, string> = {};
    jiraSprints.forEach((s) => {
      m[s.id] = s.name;
    });
    return m;
  }, [jiraSprints]);
  const hoverData = data ? buildTicketHoverData(data, sprintNames) : undefined;
  return (
    <TicketStatusPill
      ticketKey={item.key}
      jiraStatus={(data?.jiraStatus ?? item.status) as JiraStatus}
      issueType={(data?.type ?? item.type) as IssueType}
      title={data?.title ?? item.title}
      variant={variant}
      size={size}
      showReadiness={false}
      hoverData={hoverData}
    />
  );
}

/** Regular ticket list row, mirroring the sprint board's flat pill (icon +
 *  key + status chip) + title + epic chip. A `leading` slot mirrors the board's
 *  selection gutter so rows can carry a leading checkbox. */
function TicketListRow({
  item,
  leading,
  trailing,
}: {
  item: SprintTestDocItem;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 py-1">
      {leading}
      <TestDocTicketPill item={item} variant="list" size="lg" />
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

/** Eyebrow with a trailing hairline, marking a document section without boxing it. */
function SectionRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <SectionLabel>{children}</SectionLabel>
      <div aria-hidden className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

/** One clickable row in the contents rail; the dot mirrors the marker colors. */
function OutlineEntry({
  dotClass,
  label,
  count,
  onJump,
}: {
  dotClass: string;
  label: string;
  count?: number;
  onJump: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      title={label}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-body-sm text-text-tertiary hover:bg-overlay-subtle hover:text-text-primary active:opacity-70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 text-caption text-text-muted">{count}</span>}
    </button>
  );
}

/** One row action, rendered inline when it stands alone or as a menu row when
 *  it shares the row with others (see {@link RowActions}). */
type RowAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  disabled?: boolean;
  onSelect: () => void;
};

/**
 * Overflow menu holding a row's actions. On the gap lists every action collapses
 * behind this "..." (BRDG-472) — Open/Edit, Generate/Regenerate and Skip — so the
 * row reads as a document line, not a toolbar. Portalled via AnchoredPanel so the
 * menu escapes the modal body's scroll clip.
 */
function RowOverflowMenu({ item, actions }: { item: SprintTestDocItem; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${item.key}`}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          open
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
      >
        <MoreHorizontal size={14} strokeWidth={1.75} />
      </button>
      <AnchoredPanel
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        insideRefs={[triggerRef]}
        placement="bottom-end"
        gap={4}
        unstyled
      >
        <MenuList>
          {actions.map((action) => (
            <MenuItem
              key={action.key}
              icon={action.icon}
              disabled={action.disabled}
              onClick={() => {
                close();
                action.onSelect();
              }}
              title={action.title}
            >
              {action.label}
            </MenuItem>
          ))}
        </MenuList>
      </AnchoredPanel>
    </>
  );
}

/**
 * Per-row actions on the gap lists (missing / not-finished). Every action lives
 * behind the "..." overflow so the row reads as a document line (BRDG-472):
 * Open/Edit opens the review popup, Generate becomes Regenerate once a saved doc
 * or an unreviewed draft exists, and Skip marks the story as not needing a doc. A
 * row that offers only a single action renders it inline rather than behind a menu.
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
  const alreadyGenerated = Boolean(item.doc) || Boolean(item.hasDraft);
  const actions: RowAction[] = [
    {
      key: "open",
      label: item.doc ? "Edit" : "Open",
      icon: <SquarePen size={12} strokeWidth={1.5} />,
      title: item.doc ? "Open this doc in the review popup to edit it" : "Open this story in the review popup",
      onSelect: () => onOpen(item.key),
    },
    {
      key: "generate",
      label: alreadyGenerated ? "Regenerate" : "Generate",
      icon: alreadyGenerated ? <RefreshCw size={12} strokeWidth={1.5} /> : <Sparkles size={12} strokeWidth={1.5} />,
      title: alreadyGenerated ? "Regenerate the doc and review it" : "Generate the doc and review it",
      onSelect: () => onGenerate(item.key),
    },
    {
      key: "skip",
      label: "Skip",
      icon: <CircleSlash size={12} strokeWidth={1.5} />,
      title: "Mark as needing no test documentation — moves it out of the delivery gap",
      disabled: skipping,
      onSelect: () => onSkip(item.key),
    },
  ];

  if (actions.length === 1) {
    const only = actions[0];
    return (
      <span className="flex shrink-0 items-center gap-1">
        <CaptionButton onClick={only.onSelect} disabled={only.disabled} title={only.title}>
          {only.label}
        </CaptionButton>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <RowOverflowMenu item={item} actions={actions} />
    </span>
  );
}

/** DOM id a rail entry scrolls to; block anchors are per ticket key. */
export function bundleAnchorId(suffix: string): string {
  return `bundle-${suffix}`;
}

/**
 * One rendered doc entry in the delivery document. The bundle reads as one
 * editorial document (it IS what the PO copies to stakeholders), so entries are
 * articles, not cards: a display-font story heading with a quiet meta line
 * (ticket pill + state tags) and the doc body in the app's reading typography.
 * `variant="misc"` renders the internal one-liners at a lower heading weight;
 * `provisional` (opt-in unfinished stories, BRDG-465) and `isDraft` (unreviewed
 * draft folded in, BRDG-473) each carry a brand-tinted left accent + tag so the
 * block cannot be mistaken for a shipped, reviewed deliverable.
 */
function TestDocBlock({
  item,
  onEditItem,
  variant = "card",
  provisional = false,
  isDraft = false,
}: {
  item: SprintTestDocItem;
  onEditItem: (key: string) => void;
  variant?: "card" | "misc";
  provisional?: boolean;
  isDraft?: boolean;
}) {
  const { title, body } = splitDocTitle(item.doc ?? "");
  const isCard = variant === "card";
  const header = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3
          className={
            isCard
              ? "min-w-0 font-[var(--font-display)] text-heading font-semibold leading-snug tracking-[-0.02em] text-text-primary"
              : "min-w-0 font-[var(--font-display)] text-body-lg font-semibold leading-snug tracking-[-0.01em] text-text-primary"
          }
        >
          {title ?? item.title}
        </h3>
        {/* Hover-revealed so the reading surface stays a document, not a toolbar. */}
        <CaptionButton
          onClick={() => onEditItem(item.key)}
          className="shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/block:opacity-100"
          title="Open this doc in the review modal; you return here when done"
        >
          Edit
        </CaptionButton>
      </div>
      <div className={isCard ? "mb-3 mt-1.5 flex flex-wrap items-center gap-2" : "mb-2 mt-1 flex flex-wrap items-center gap-2"}>
        <TestDocTicketPill item={item} size="sm" />
        {isDraft && <Tag color="brand">draft</Tag>}
        {item.needsInput && <Tag color="amber">needs input</Tag>}
        {provisional && <Tag color="neutral">not finished yet</Tag>}
      </div>
    </>
  );
  const content = (
    <div className="description-content">{renderMarkdown(title === null ? item.doc ?? "" : body)}</div>
  );
  return (
    <article
      data-testid={isCard ? "test-docs-block" : undefined}
      id={bundleAnchorId(`block-${item.key}`)}
      className={`group/block scroll-mt-4 ${isCard ? "py-7 first:pt-1 last:pb-2" : ""} ${
        provisional || isDraft ? "border-l-2 border-[var(--color-brand-400)]/45 pl-4" : ""
      }`}
    >
      {header}
      {content}
    </article>
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
  // Draft-only stories (BRDG-473) always show in the preview (tagged draft); this
  // master switch decides whether they leave in the copy. Default off: an
  // unreviewed draft never lands in a stakeholder copy unless the PO opts in.
  const [includeDrafts, setIncludeDrafts] = useState(false);
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
      // Overlay, not a one-shot cache patch: the list revalidation below can be
      // served a stale snapshot (short server/browser response caches), which
      // would keep the old board marker until the next poll. The overlay
      // re-applies the value on every render until a fresh read confirms it.
      registerPendingEdit(key, "testDocState", "not_needed", Date.now());
      try {
        await ticketsApi.markTestDocNotNeeded(key);
        confirmPendingEdit(key, "testDocState");
        patchTicketDetailCache(key, { testDocState: "not_needed" });
        invalidateTestDocCache(key);
        await mutate(sprints.testDocsUrl(sprintId));
        void mutate((k) => typeof k === "string" && k.startsWith("/api/tickets"));
        showToast(`${key} marked as no test documentation needed`);
      } catch (err) {
        clearPendingEdit(key, "testDocState");
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

  // Draft-only stories folded into the document (finished ones from the route,
  // plus any opted-in not-finished draft). Drives the top notice and gates the
  // copy toggle's visibility.
  const draftCount = useMemo(
    () =>
      documentedAll.filter((i) => i.isDraft).length + internalAll.filter((i) => i.isDraft).length,
    [documentedAll, internalAll],
  );

  const document = useMemo(
    () => buildTestDocDocument(documentedAll, internalAll, includeDrafts),
    [documentedAll, internalAll, includeDrafts],
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

  // Contents-rail navigation: the document pane scrolls, the rail is sticky.
  const scrollRef = useRef<HTMLDivElement>(null);
  const jumpTo = useCallback((suffix: string) => {
    scrollRef.current
      ?.querySelector(`#${bundleAnchorId(suffix)}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <Modal open onClose={onClose} aria-label="Sprint test documentation">
      <div className="flex h-[min(880px,90vh)] w-[min(1220px,95vw)] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-2xl">
        <ModalHeader
          icon={<FileCheck2 size={16} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />}
          title="Test documentation"
          // The sprint name lives in the document title below; the chrome
          // carries the delivery state instead.
          subtitle={
            <p className="mt-0.5 truncate text-body-sm text-text-tertiary">
              {data
                ? `${documentedAll.length + internalAll.length} documented${draftCount > 0 ? ` · ${draftCount} draft` : ""}${data.missing.length > 0 ? ` · ${data.missing.length} missing` : ""}`
                : "…"}
            </p>
          }
          onClose={onClose}
        />

        {/* Body: contents rail left, the delivery document right. */}
        <div className="flex min-h-0 flex-1">
          {data && (
            <nav
              aria-label="Document contents"
              className="hidden w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border-subtle bg-surface-base/60 px-3 py-4 md:flex"
            >
              {data.missing.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <div className="px-2 pb-1"><SectionLabel>Needs attention</SectionLabel></div>
                  <OutlineEntry
                    dotClass="bg-[var(--color-status-warning)]"
                    label="Missing documentation"
                    count={data.missing.length}
                    onJump={() => jumpTo("missing")}
                  />
                </div>
              )}
              {(documentedAll.length > 0 || internalAll.length > 0) && (
                <div className="flex flex-col gap-0.5">
                  <div className="px-2 pb-1"><SectionLabel>In this document</SectionLabel></div>
                  {documentedAll.map((item) => (
                    <OutlineEntry
                      key={item.key}
                      dotClass={
                        selectedUnfinished.has(item.key)
                          ? "bg-[var(--color-brand-400)]"
                          : "bg-[var(--color-status-success)]"
                      }
                      label={splitDocTitle(item.doc ?? "").title ?? item.title}
                      onJump={() => jumpTo(`block-${item.key}`)}
                    />
                  ))}
                  {internalAll.length > 0 && (
                    <OutlineEntry
                      dotClass="bg-[var(--color-text-muted)]/60"
                      label="Misc"
                      count={internalAll.length}
                      onJump={() => jumpTo("misc")}
                    />
                  )}
                </div>
              )}
              {(data.notNeeded.length > 0 || data.other.length > 0) && (
                <div className="flex flex-col gap-0.5">
                  <div className="px-2 pb-1"><SectionLabel>Outside the document</SectionLabel></div>
                  {data.notNeeded.length > 0 && (
                    <OutlineEntry
                      dotClass="bg-[var(--color-text-muted)]/60"
                      label="Not needed"
                      count={data.notNeeded.length}
                      onJump={() => jumpTo("not-needed")}
                    />
                  )}
                  {data.other.length > 0 && (
                    <OutlineEntry
                      dotClass="bg-[var(--color-text-muted)]/60"
                      label="Not finished yet"
                      count={data.other.length}
                      onJump={() => jumpTo("other")}
                    />
                  )}
                </div>
              )}
            </nav>
          )}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[780px] px-8 py-7">
              {error && <InlineAlert variant="error">Failed to load test documentation.</InlineAlert>}
              {!data && !error && (
                <LoadingState variant="spinner" label="Loading test documentation…" className="h-40" />
              )}
              {data && (
                <>
                  {/* The document's own title: this pane previews exactly what
                      leaves Bridge, so it reads as a document, not an admin list. */}
                  <header className="mb-6">
                    <p className="text-caption font-semibold uppercase tracking-wider text-[var(--color-brand-400)]">
                      Sprint delivery
                    </p>
                    <h2 className="mt-1 font-[var(--font-display)] text-heading-lg font-bold tracking-[-0.03em] text-text-primary">
                      {data.sprintName}
                    </h2>
                  </header>

                  {/* Missing overview first: the gap list is what blocks delivery. */}
                  {data.missing.length > 0 && (
                    <div
                      data-testid="test-docs-missing"
                      id={bundleAnchorId("missing")}
                      className="mb-8 scroll-mt-4 border-l-2 border-[var(--color-status-warning)]/60 pl-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-body-sm font-medium text-text-secondary">
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

                  {/* Draft notice: draft-only stories are folded into the document
                      below (tagged draft) so the bundle reads complete, but they
                      are unreviewed — flag that before the reader trusts it. */}
                  {draftCount > 0 && (
                    <div
                      data-testid="test-docs-draft-notice"
                      className="mb-8 border-l-2 border-[var(--color-brand-400)]/45 pl-4"
                    >
                      <p className="text-body-sm font-medium text-text-secondary">
                        {draftCount} {draftCount === 1 ? "story still has" : "stories still have"} a draft test doc
                      </p>
                      <p className="mt-0.5 text-body-sm text-text-muted">
                        Included below, marked as draft — review to finalize. Use “Include drafts” to copy them.
                      </p>
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
                    <section>
                      <SectionRule>Documented ({documentedAll.length})</SectionRule>
                      <div className="mt-2 flex flex-col divide-y divide-border-subtle">
                        {documentedAll.map((item) => (
                          <TestDocBlock
                            key={item.key}
                            item={item}
                            onEditItem={onEditItem}
                            provisional={selectedUnfinished.has(item.key)}
                            isDraft={item.isDraft}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {internalAll.length > 0 && (
                    <section
                      data-testid="test-docs-misc"
                      id={bundleAnchorId("misc")}
                      className="mt-8 scroll-mt-4"
                    >
                      <SectionRule>Misc ({internalAll.length})</SectionRule>
                      <div className="mt-4 flex flex-col gap-6">
                        {internalAll.map((item) => (
                          <TestDocBlock
                            key={item.key}
                            item={item}
                            onEditItem={onEditItem}
                            variant="misc"
                            provisional={selectedUnfinished.has(item.key)}
                            isDraft={item.isDraft}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {data.notNeeded.length > 0 && (
                    <section
                      data-testid="test-docs-not-needed"
                      id={bundleAnchorId("not-needed")}
                      className="mt-10 scroll-mt-4"
                    >
                      <SectionRule>No test documentation needed ({data.notNeeded.length})</SectionRule>
                      <ul className="mt-2.5 flex flex-col gap-1">
                        {data.notNeeded.map((m) => (
                          <TicketListRow
                            key={m.key}
                            item={m}
                            trailing={
                              <CaptionButton
                                className="shrink-0"
                                onClick={() => onEditItem(m.key)}
                                title={m.doc ? "Open this doc in the review popup to edit it" : "Open this story in the review popup to still write a doc"}
                              >
                                {m.doc ? "Edit" : "Open"}
                              </CaptionButton>
                            }
                          />
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Not in DONE/Test yet, so not counted as missing — but the PO
                      decides what ships: generate a doc, then tick the story to fold
                      it into the delivery document (BRDG-465). */}
                  {data.other.length > 0 && (
                    <section
                      data-testid="test-docs-other"
                      id={bundleAnchorId("other")}
                      className="mt-10 scroll-mt-4"
                    >
                      <SectionRule>Not finished yet ({data.other.length})</SectionRule>
                      <p className="mt-1.5 text-body-sm text-text-muted">
                        Ships with this delivery? Generate a doc, then tick it to include it in the document.
                      </p>
                      <ul className="mt-2.5 flex flex-col gap-1">
                        {data.other.map((m) => (
                          <TicketListRow
                            key={m.key}
                            item={m}
                            leading={
                              m.doc ? (
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
                                  className="flex shrink-0 cursor-pointer items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                                >
                                  <Checkbox checked={selectedUnfinished.has(m.key)} />
                                </div>
                              ) : (
                                // Keep the checkbox gutter reserved so doc-less rows stay aligned
                                // with the ticked ones, mirroring the board's selection column.
                                <span aria-hidden className="w-3.5 shrink-0" />
                              )
                            }
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
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle px-5 py-3.5">
          <Button variant="ghost" size="md" className="mr-auto" onClick={onClose}>
            Close
          </Button>
          {/* Master switch for whether draft blocks leave in the copy (BRDG-473);
              only shown when there is a draft to include. */}
          {draftCount > 0 && (
            <label className="flex cursor-pointer select-none items-center gap-2 pr-1 text-body-sm text-text-secondary">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={includeDrafts}
                onChange={(e) => setIncludeDrafts(e.target.checked)}
              />
              <Checkbox
                checked={includeDrafts}
                className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-brand-400)]"
              />
              Include drafts
            </label>
          )}
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
