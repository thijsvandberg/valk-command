"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { Ticket, TicketReadiness, TicketDetail, JiraStatus } from "@/types/ticket";
import { READINESS_CONFIG } from "@/types/ticket";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, AlertTriangle, Play, Boxes } from "lucide-react";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { tickets, jira, apiFetch } from "@/lib/api-client";
import { patchTicketCaches, patchTicketDetailCache, moveTicketSprintCaches } from "@/lib/ticket-cache";
import { registerPendingEdit, confirmPendingEdit, clearPendingEdit } from "@/components/sprint-board/pendingTicketEdits";
import { reportClientError } from "@/lib/client-error";
import { getScoreColor } from "@/lib/status-colors";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { userInitials, userColor } from "@/lib/user-utils";
import { Avatar } from "@/components/shared/Avatar";
import { QualityBadge } from "@/components/sprint-board/TicketTable";
import { ReadinessCell } from "@/components/shared/ReadinessCell";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { SprintListModal } from "@/components/sprint-board/SprintListModal";
import { AssigneePicker } from "@/components/shared/AssigneePicker";
import { WatchersRow } from "@/components/shared/WatchersRow";
import { EpicPicker } from "@/components/shared/EpicPicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { Tooltip } from "@/components/shared/Tooltip";
import { useJiraSprints, useSprintSlots, useDevInfo } from "@/hooks/useSprintBoard";
import { Tag } from "@/components/shared/Tag";
import { LabelPicker } from "@/components/shared/LabelPicker";
import { DevPanel } from "@/components/ticket-detail/DevPanel";
import { ConfluencePagesSection } from "@/components/ticket-detail/ConfluencePagesSection";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { useTicketSessionMap } from "@/hooks/useTicketSessionMap";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[32px] items-center justify-between gap-3">
      <span className="shrink-0 text-body-sm text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-body-sm text-text-secondary">{children}</div>
    </div>
  );
}

function CompactField({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-lg border border-border-subtle px-3 py-2"
      style={{
        backgroundColor: accent ? "color-mix(in srgb, var(--color-brand-500) 4%, var(--color-surface-elevated))" : "var(--color-overlay-subtle)",
        transition: "background-color 0.15s ease",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-text-muted">{label}</span>
        <div className="text-body-lg text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

const COMPLETENESS_LABELS: Record<string, string> = {
  Description: "Desc",
  AC: "AC",
  Points: "Pts",
  BV: "BV",
  Review: "Rev",
};

export interface TicketMetaContentProps {
  ticket: Ticket;
  detail: TicketDetail | undefined;
  reviewData?: { reviews: { storyVersionHash?: string | null; overallScore: number }[]; currentVersionHash: string | null } | undefined;
  onReadinessChange?: (v: TicketReadiness | null) => void;
  onNavigateToReview?: () => void;
  onNavigateToDev?: () => void;
  /** Notifies the host after a field edit persists, so it can refresh its own
   *  ticket list/cache. The full ticket page leaves this undefined. */
  onMutate?: () => void;
  /** Layout classes for the scroll container the host provides. Must include
   *  horizontal padding (footer sections bleed to the edges via `-mx-5`). */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The shared meta panel (scores, status, epic, sprint, assignee, readiness,
 * quality, PO note, Confluence, dev) used by both the full ticket page's
 * `TicketSidebar` shell and the sprint-board `SidePanel`. Hosts supply the
 * scroll/padding container via `className`; the footer assumes `px-5`.
 */
export function TicketMetaContent({
  ticket,
  detail,
  reviewData,
  onReadinessChange,
  onNavigateToReview,
  onNavigateToDev,
  onMutate,
  className,
  style,
}: TicketMetaContentProps) {
  const router = useRouter();
  const { toast, showToast, dismissToast } = useToast();
  const readiness = ticket.readiness;

  // A failed sidebar edit must not vanish into the console (BRDG-401): the board
  // already reports + toasts on its edit handlers, and this sidebar edits the same
  // fields, so it mirrors that pattern. The operation + ticket key are folded into
  // the reported context (not the payload's free fields) so they land in the
  // [client] log line; only the key is included, never the edited value. The toast
  // tells the PO the change was reverted. The optimistic rollback at the call site
  // stays intact.
  const reportEditFailure = useCallback((operation: string, err: unknown) => {
    reportClientError(`ticket-detail ${operation} ${ticket.key}`, err, { source: "ticket-detail" });
    showToast(`Failed to update ${ticket.key}. Change reverted.`);
  }, [ticket.key, showToast]);
  const [businessValue, setBusinessValue] = useState<number | null>(ticket.businessValue);
  const [storyPoints, setStoryPoints] = useState<number | null>(ticket.storyPoints);
  const [poNotes, setPoNotes] = useState(ticket.notes);
  const [assignee, setAssignee] = useState(ticket.assignee);
  const [epicName, setEpicName] = useState<string | null>(ticket.epic);
  const [epicKey, setEpicKey] = useState<string | null>(ticket.epicKey);
  const [currentSprintId, setCurrentSprintId] = useState<string | null>(ticket.sprintId ?? null);
  const [jiraStatus, setJiraStatus] = useState<JiraStatus>(ticket.jiraStatus);
  // Labels arrive async via detail; an override lets edits win until the host
  // remounts (keyed on ticket) without a state-sync effect.
  const [labelsOverride, setLabelsOverride] = useState<string[] | null>(null);

  // Hosts key this component on ticket.key, so switching tickets remounts and
  // re-initializes the field state above. But when the *same* ticket is updated
  // in place (e.g. a streamed/external change from Jira), no remount happens and
  // the local copies go stale. Re-sync them from the prop. Optimistic edits
  // converge because the prop only changes once the edit persists and the host
  // refetches; deps are primitives so a new assignee object identity per render
  // does not retrigger this.
  useEffect(() => {
    setBusinessValue(ticket.businessValue);
    setStoryPoints(ticket.storyPoints);
    setPoNotes(ticket.notes);
    setAssignee(ticket.assignee);
    setEpicName(ticket.epic);
    setEpicKey(ticket.epicKey);
    setCurrentSprintId(ticket.sprintId ?? null);
    setJiraStatus(ticket.jiraStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ticket.businessValue,
    ticket.storyPoints,
    ticket.notes,
    ticket.assignee?.name,
    ticket.epic,
    ticket.epicKey,
    ticket.sprintId,
    ticket.jiraStatus,
  ]);
  const labels = useMemo(() => labelsOverride ?? detail?.labels ?? [], [labelsOverride, detail?.labels]);
  const [showMore, setShowMore] = useState(ticket.qualityScore !== null);
  const [poNoteExpanded, setPoNoteExpanded] = useState(false);
  const poNoteRef = useRef<HTMLTextAreaElement>(null);

  const { sprints } = useJiraSprints();
  const { data: sprintSlots } = useSprintSlots();
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const sprintTriggerRef = useRef<HTMLButtonElement>(null);
  const [sprintModalPos, setSprintModalPos] = useState<{ top: number; right: number } | null>(null);

  const pinnedSprintIds = useMemo(() => {
    if (!sprintSlots) return new Set<string>();
    return new Set(sprintSlots.map((s) => s.sprintId));
  }, [sprintSlots]);

  const { ticketSessionMap } = useTicketSessionMap();
  const ticketSessions = ticketSessionMap.get(ticket.key);

  const { data: devInfo, isLoading: devInfoLoading } = useDevInfo(ticket.key);
  const latestReview = reviewData?.reviews?.[0] ?? null;
  const currentVersionHash = reviewData?.currentVersionHash ?? null;
  const isReviewOutdated = latestReview && currentVersionHash
    ? latestReview.storyVersionHash !== currentVersionHash
    : false;

  const handleReadinessChange = useCallback((v: TicketReadiness | null) => {
    onReadinessChange?.(v);
  }, [onReadinessChange]);

  // Fields below also live on the board row. Setting one from the sidebar must use
  // the pendingTicketEdits overlay (registerPendingEdit), not just a one-shot cache
  // patch: the board refetches its list constantly (poll/focus/sync/picker-close), so
  // a single patch is overwritten by the next refetch before Jira catches up and the
  // change "snaps back" until a manual refresh (BRDG-382). The overlay re-applies the
  // value on every render until the server confirms it. patchTicketDetailCache keeps
  // this sidebar's own picker in sync without patching the list cache, which would let
  // the board's self-heal clear the overlay early. Mirrors useTicketActions.
  const handleBusinessValueChange = useCallback(async (v: number | null) => {
    const prev = businessValue;
    setBusinessValue(v);
    registerPendingEdit(ticket.key, "businessValue", v, Date.now());
    patchTicketDetailCache(ticket.key, { businessValue: v });
    try {
      await tickets.updateMetadata(ticket.key, { businessValue: v });
      confirmPendingEdit(ticket.key, "businessValue");
      onMutate?.();
    } catch (err) {
      setBusinessValue(prev);
      clearPendingEdit(ticket.key, "businessValue");
      patchTicketDetailCache(ticket.key, { businessValue: prev });
      reportEditFailure("business-value", err);
    }
  }, [ticket.key, businessValue, onMutate, reportEditFailure]);

  const handleStoryPointsChange = useCallback(async (v: number | null) => {
    const prev = storyPoints;
    setStoryPoints(v);
    registerPendingEdit(ticket.key, "storyPoints", v, Date.now());
    patchTicketDetailCache(ticket.key, { storyPoints: v });
    try {
      await tickets.updateStoryPoints(ticket.key, v);
      confirmPendingEdit(ticket.key, "storyPoints");
      onMutate?.();
    } catch (err) {
      setStoryPoints(prev);
      clearPendingEdit(ticket.key, "storyPoints");
      patchTicketDetailCache(ticket.key, { storyPoints: prev });
      reportEditFailure("story-points", err);
    }
  }, [ticket.key, storyPoints, onMutate, reportEditFailure]);

  const handleJiraStatusChange = useCallback(async (status: JiraStatus) => {
    const prev = jiraStatus;
    setJiraStatus(status);
    registerPendingEdit(ticket.key, "jiraStatus", status, Date.now());
    patchTicketDetailCache(ticket.key, { jiraStatus: status });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(ticket.key)}/status`, { method: "PUT", body: { status } });
      confirmPendingEdit(ticket.key, "jiraStatus");
      onMutate?.();
    } catch (err) {
      setJiraStatus(prev);
      clearPendingEdit(ticket.key, "jiraStatus");
      patchTicketDetailCache(ticket.key, { jiraStatus: prev });
      reportEditFailure("jira-status", err);
    }
  }, [ticket.key, jiraStatus, onMutate, reportEditFailure]);

  const handleSprintChange = useCallback(async (sprintId: string | null) => {
    if (!sprintId) return;
    const prev = currentSprintId;
    setCurrentSprintId(sprintId);
    // Move the row between sprint lists at once so it leaves the current
    // (e.g. backlog) view immediately. We deliberately do NOT revalidate after
    // the move (no onMutate): the move route and the tickets GET hold separate
    // caches in next dev, so a bare revalidation re-reads the stale 30s list and
    // the row briefly pops back. The optimistic cache writes are authoritative
    // until the natural refresh reconciles. Mirrors the board's bulk-move handler.
    moveTicketSprintCaches(ticket, sprintId);
    try {
      await jira.moveSprint({ issueKeys: [ticket.key], targetSprintId: sprintId });
    } catch (err) {
      setCurrentSprintId(prev);
      moveTicketSprintCaches(ticket, prev ?? "__backlog__");
      reportEditFailure("sprint", err);
    }
  }, [ticket, currentSprintId, reportEditFailure]);

  const handleSprintModalSelect = useCallback((sprintId: string) => {
    handleSprintChange(sprintId);
  }, [handleSprintChange]);

  const handleOpenSprintModal = useCallback(() => {
    if (sprintTriggerRef.current) {
      const rect = sprintTriggerRef.current.getBoundingClientRect();
      setSprintModalPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setSprintModalOpen(true);
  }, []);

  const handleAssigneeChange = useCallback(async (user: { accountId: string | null; displayName: string; avatarUrl: string | null } | null) => {
    const prev = assignee;
    // Derive initials/color the same way the rest of the app does so the optimistic
    // value matches what the server returns, letting the overlay's self-heal clear on
    // the first matching refetch instead of waiting out the TTL.
    const next: typeof assignee = user
      ? { name: user.displayName, initials: userInitials(user.displayName), color: userColor(user.displayName) }
      : null;
    setAssignee(next);
    registerPendingEdit(ticket.key, "assignee", next, Date.now());
    patchTicketDetailCache(ticket.key, { assignee: next });
    try {
      await jira.assign({
        issueKey: ticket.key,
        accountId: user?.accountId ?? null,
        name: user?.displayName ?? null,
      });
      confirmPendingEdit(ticket.key, "assignee");
      onMutate?.();
    } catch (err) {
      setAssignee(prev);
      clearPendingEdit(ticket.key, "assignee");
      patchTicketDetailCache(ticket.key, { assignee: prev });
      reportEditFailure("assignee", err);
    }
  }, [ticket.key, assignee, onMutate, reportEditFailure]);

  const handleEpicChange = useCallback(async (epic: EpicOption | null) => {
    const prevName = epicName;
    const prevKey = epicKey;
    const now = Date.now();
    setEpicName(epic?.name ?? null);
    setEpicKey(epic?.key ?? null);
    // Both fields go through the overlay: the board row only renders the epic chip
    // when name AND key are set, and a one-shot list patch is clobbered by the next
    // refetch before Jira reflects the write, so the chip never appeared until a
    // manual refresh (BRDG-382, the reported bug).
    registerPendingEdit(ticket.key, "epic", epic?.name ?? null, now);
    registerPendingEdit(ticket.key, "epicKey", epic?.key ?? null, now);
    patchTicketDetailCache(ticket.key, { epic: epic?.name ?? null, epicKey: epic?.key ?? null });
    try {
      await tickets.updateEpic(ticket.key, epic?.key ?? null);
      confirmPendingEdit(ticket.key, "epic");
      confirmPendingEdit(ticket.key, "epicKey");
      onMutate?.();
    } catch (err) {
      setEpicName(prevName);
      setEpicKey(prevKey);
      clearPendingEdit(ticket.key, "epic");
      clearPendingEdit(ticket.key, "epicKey");
      patchTicketDetailCache(ticket.key, { epic: prevName, epicKey: prevKey });
      reportEditFailure("epic", err);
    }
  }, [ticket.key, epicName, epicKey, onMutate, reportEditFailure]);

  const handleLabelsChange = useCallback(async (newLabels: string[]) => {
    const prev = labels;
    setLabelsOverride(newLabels);
    patchTicketCaches(ticket.key, { labels: newLabels });
    try {
      await tickets.updateLabels(ticket.key, newLabels);
      onMutate?.();
    } catch (err) {
      setLabelsOverride(prev);
      patchTicketCaches(ticket.key, { labels: prev });
      reportEditFailure("labels", err);
    }
  }, [ticket.key, labels, onMutate, reportEditFailure]);

  const handleNotesChange = useCallback(async (notes: string) => {
    const prev = poNotes;
    setPoNotes(notes);
    patchTicketCaches(ticket.key, { notes });
    try {
      await tickets.updateMetadata(ticket.key, { poNotes: notes });
      onMutate?.();
    } catch (err) {
      setPoNotes(prev);
      patchTicketCaches(ticket.key, { notes: prev });
      reportEditFailure("po-notes", err);
    }
  }, [ticket.key, poNotes, onMutate, reportEditFailure]);

  const description = detail?.description ?? "";
  const hasDescription = description.trim().length > 20;
  const hasAcceptanceCriteria = /acceptance\s*criteria/i.test(description);
  const hasPoints = storyPoints !== null;
  const hasBV = businessValue !== null;
  const hasReview = ticket.qualityScore !== null;
  const completenessChecks = [
    { label: "Description", done: hasDescription },
    { label: "AC", done: hasAcceptanceCriteria },
    { label: "Points", done: hasPoints },
    { label: "BV", done: hasBV },
    { label: "Review", done: hasReview },
  ];
  const completenessCount = completenessChecks.filter((c) => c.done).length;

  const readinessCfg = readiness ? READINESS_CONFIG[readiness] : null;

  // For a subtask the parent is its primary context, so it sits above Status; for other
  // types it keeps its place below Status. The card is shared between both positions (BRDG-333).
  const isSubtask = ticket.type === "subtask";
  const parentCard = detail?.parent ? (
    <div className="flex flex-col gap-1.5 py-1.5">
      <span className="text-body-sm text-text-tertiary">Parent</span>
      {/* A clickable element rather than an <a>: TicketStatusPill renders its own key
          link, which cannot legally nest inside an anchor (mirrors SearchResultParts /
          the Sprint Board row, BRDG-324/BRDG-332). The pill's interactive segment stops
          propagation so the key dropdown works without triggering card navigation. */}
      <div
        role="link"
        tabIndex={0}
        aria-label={`Open parent ${detail.parent.key}`}
        onClick={(e) => {
          const href = `/tickets/${detail.parent!.key}`;
          if (e.metaKey || e.ctrlKey) { window.open(href, "_blank"); return; }
          router.push(href);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(`/tickets/${detail.parent!.key}`);
          }
        }}
        className="group/parent rounded-lg border border-border-subtle bg-[var(--color-overlay-subtle)] px-3 py-2.5 flex flex-col gap-1.5 cursor-pointer hover:border-border-default hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
        title={detail.parent.title}
      >
        <span className="relative z-10 self-start" onClick={(e) => e.stopPropagation()}>
          <TicketStatusPill
            ticketKey={detail.parent.key}
            jiraStatus={detail.parent.status}
            issueType={detail.parent.type}
            title={detail.parent.title}
            variant="list"
            showKey
            showStatus
          />
        </span>
        <span className="min-w-0 truncate text-body-sm text-text-secondary group-hover/parent:text-text-primary" style={{ transition: "color 0.15s ease" }}>
          {detail.parent.title}
        </span>
      </div>
    </div>
  ) : null;

  return (
    <>
    <div className={`flex flex-col ${className ?? ""}`} style={style}>
      {/* Details */}
      <div className="space-y-3">

        {/* SP / BV (above status). Subtasks are not estimated or scored, so the row is
            hidden for them (BRDG-333). */}
        {ticket.type !== "subtask" && (
          <div className="grid grid-cols-2 gap-2">
            <CompactField label="Story Points" accent={hasPoints}>
              <StoryPointPicker
                value={storyPoints}
                onChange={handleStoryPointsChange}
                showMetricIcon
                richTooltip
              />
            </CompactField>
            <CompactField label="Business Value" accent={hasBV}>
              <BusinessValuePicker value={businessValue} onChange={handleBusinessValueChange} align="right" showMetricIcon richTooltip />
            </CompactField>
          </div>
        )}

        {/* Status & Flow */}
        <div>
          {isSubtask && parentCard}
          <DetailRow label="Status">
            <div className="flex justify-end">
              <TicketStatusPill
                ticketKey={ticket.key}
                jiraStatus={jiraStatus}
                onJiraStatusChange={handleJiraStatusChange}
                variant="list"
                size="lg"
                showKey={false}
                showReadiness={false}
                showHoverCard={false}
              />
            </div>
          </DetailRow>
          {ticket.type !== "epic" && ticket.type !== "subtask" && (
            <DetailRow label="Epic">
              <EpicPicker
                value={epicKey ? { key: epicKey, name: epicName ?? epicKey } : null}
                onChange={handleEpicChange}
                align="right"
                ticketKey={ticket.key}
                textClass="text-body-sm"
              />
            </DetailRow>
          )}
          {!isSubtask && parentCard}
          {ticket.type !== "epic" && (
            <DetailRow label="Sprint">
              <div className="relative">
                <button
                  ref={sprintTriggerRef}
                  type="button"
                  onClick={() => sprintModalOpen ? setSprintModalOpen(false) : handleOpenSprintModal()}
                  title={currentSprintId ? `Sprint: ${sprints?.find((s) => String(s.id) === currentSprintId)?.name ?? currentSprintId}` : "No sprint"}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 -mr-2 text-body-sm text-text-secondary cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
                  style={{ transition: "background-color 0.15s ease" }}
                >
                  <span className="truncate">{sprints?.find((s) => String(s.id) === currentSprintId)?.name ?? "None"}</span>
                </button>
                {sprintModalOpen && sprintModalPos && (
                  <SprintListModal
                    onClose={() => setSprintModalOpen(false)}
                    onSelect={handleSprintModalSelect}
                    onPin={() => {}}
                    pinnedIds={pinnedSprintIds}
                    portalAnchor={sprintModalPos}
                  />
                )}
              </div>
            </DetailRow>
          )}
          {ticketSessions && ticketSessions.length > 0 && (
            <DetailRow label="Refinement">
              <div className="flex flex-wrap justify-end gap-1.5">
                {ticketSessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/refinement/${s.id}`}
                    className="group/ref inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.06] px-2 py-0.5 text-body-sm font-medium text-[var(--color-brand-600)] hover:border-[var(--color-brand-500)]/30 hover:bg-[var(--color-brand-500)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
                    style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
                    title={`Open refinement session: ${s.name}`}
                  >
                    <Boxes size={12} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-500)]/70" />
                    <span className="min-w-0 truncate max-w-[150px]">{s.name}</span>
                  </Link>
                ))}
              </div>
            </DetailRow>
          )}
          <DetailRow label="Assignee">
            <AssigneePicker
              value={assignee}
              onChange={handleAssigneeChange}
              align="right"
              textClass="text-body-sm"
            />
          </DetailRow>
          <DetailRow label="Watchers">
            <WatchersRow ticketKey={ticket.key} align="right" />
          </DetailRow>
          {detail?.reporter && (
            <DetailRow label="Reporter">
              <div className="flex items-center justify-end gap-2">
                <span className="truncate">{detail.reporter.name}</span>
                <Avatar assignee={detail.reporter} size={20} />
              </div>
            </DetailRow>
          )}

          {/* Timestamps & Meta */}
          {detail && (
            <>
              <DetailRow label="Created">
                <Tooltip content={formatAbsoluteDate(detail.createdAt)}>
                  <span>{relativeDate(detail.createdAt)}</span>
                </Tooltip>
              </DetailRow>
              <DetailRow label="Updated">
                <Tooltip content={formatAbsoluteDate(detail.updatedAt)}>
                  <span>{relativeDate(detail.updatedAt)}</span>
                </Tooltip>
              </DetailRow>
            </>
          )}
          {detail?.components && detail.components.length > 0 && (
            <DetailRow label="Components">
              <div className="flex flex-wrap justify-end gap-1">
                {detail.components.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </div>
            </DetailRow>
          )}
        </div>

        {/* More section */}
        <div>
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            aria-expanded={showMore}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 cursor-pointer border border-border-subtle hover:border-[var(--color-brand-500)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{
              backgroundColor: "var(--color-overlay-subtle)",
              transition: "background-color 0.15s ease, border-color 0.15s ease",
            }}
          >
            <span className="text-body-sm font-medium text-text-tertiary">{showMore ? "Less" : "More details"}</span>
            <ChevronDown
              size={12}
              strokeWidth={1.5}
              className={`shrink-0 text-text-muted ${showMore ? "" : "-rotate-90"}`}
              style={{ transition: "transform 0.2s ease" }}
            />
          </button>
          {showMore && (
            <div className="mt-3 space-y-3">
              {/* Completeness indicator */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-body-sm text-text-tertiary">Readiness</span>
                  <span className="text-label tabular-nums text-text-tertiary">{completenessCount}/{completenessChecks.length}</span>
                </div>
                <div className="mt-2 flex gap-1">
                  {completenessChecks.map((check) => (
                    <div
                      key={check.label}
                      className="group relative h-1.5 flex-1 overflow-hidden rounded-full"
                      title={`${check.label}: ${check.done ? "Complete" : "Missing"}`}
                    >
                      <div className="absolute inset-0 rounded-full bg-overlay-default" />
                      {check.done && (
                        <div
                          className="absolute inset-0 rounded-full bg-[var(--color-brand-500)]"
                          style={{ opacity: 0.7 }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1">
                  {completenessChecks.map((check) => (
                    <span
                      key={check.label}
                      className={`flex-1 text-center text-caption ${check.done ? "text-text-tertiary" : "text-text-muted"}`}
                      title={check.label}
                    >
                      {COMPLETENESS_LABELS[check.label] ?? check.label}
                    </span>
                  ))}
                </div>
              </div>
              <DetailRow label="Readiness">
                <div className="flex items-center justify-end gap-2">
                  <span
                    className="text-body-sm"
                    style={{ color: readinessCfg?.color ?? "var(--color-text-muted)" }}
                  >
                    {readinessCfg?.label ?? "Ready for Development"}
                  </span>
                  <ReadinessCell value={readiness} onChange={handleReadinessChange} align="right" />
                </div>
              </DetailRow>
              <DetailRow label="Labels">
                <LabelPicker
                  value={labels}
                  onChange={handleLabelsChange}
                  align="right"
                />
              </DetailRow>
              {/* Review is not relevant for epics or subtasks, so the quality panel is hidden there. */}
              {ticket.type !== "epic" && ticket.type !== "subtask" && (
              <button
                type="button"
                onClick={onNavigateToReview}
                className="w-full cursor-pointer text-left rounded-lg border border-border-subtle px-3 py-2 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                style={{
                  backgroundColor: ticket.qualityScore !== null
                    ? "color-mix(in srgb, var(--color-brand-500) 4%, var(--color-surface-elevated))"
                    : "var(--color-overlay-subtle)",
                  transition: "background-color 0.15s ease",
                }}
                title="View review details"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption text-text-muted">Quality</span>
                  <div className="flex items-center gap-1.5">
                    {ticket.qualityScore !== null ? (
                      <>
                        <QualityBadge score={ticket.qualityScore} />
                        {isReviewOutdated && (
                          <AlertTriangle size={11} strokeWidth={1.5} className="text-[var(--color-status-warning)]/70" />
                        )}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-body-sm text-text-muted">
                        <Play size={9} strokeWidth={2} className="shrink-0" />
                        Run review
                      </span>
                    )}
                  </div>
                </div>
                {ticket.qualityScore !== null && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-overlay-default">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${ticket.qualityScore}%`,
                        backgroundColor: getScoreColor(ticket.qualityScore),
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                )}
              </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spacer to push footer sections down */}
      <div className="min-h-4 flex-1" />

      {/* Footer sections: pushed to bottom, scrolls with the host */}
      <div className="-mx-5 -mb-4 border-t border-border-default bg-[var(--color-surface-elevated)] px-5 pt-3 pb-4 space-y-3">
        {/* PO Note */}
        <div>
          <button
            type="button"
            onClick={() => {
              const next = !poNoteExpanded;
              setPoNoteExpanded(next);
              if (next) {
                requestAnimationFrame(() => poNoteRef.current?.focus());
              }
            }}
            aria-expanded={poNoteExpanded}
            className="flex w-full items-center justify-between cursor-pointer bg-transparent border-0 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <div className="flex items-center gap-1.5">
              <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">PO Note</h3>
              {poNotes.trim() && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]"
                  title="Has PO note"
                />
              )}
            </div>
            <ChevronDown
              size={12}
              strokeWidth={1.5}
              className={`shrink-0 text-text-muted ${poNoteExpanded ? "" : "-rotate-90"}`}
              style={{ transition: "transform 0.2s ease" }}
            />
          </button>
          {poNoteExpanded && (
            <textarea
              ref={poNoteRef}
              defaultValue={poNotes}
              placeholder="Quick annotation..."
              rows={2}
              onBlur={(e) => handleNotesChange(e.target.value)}
              className="mt-2 w-full resize-none rounded-lg border border-border-subtle bg-overlay-subtle px-3 py-2 text-body-lg text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
              style={{ transition: "border-color 0.15s ease" }}
            />
          )}
        </div>

        <div className="h-px bg-border-subtle" />

        {/* Confluence pages */}
        <ConfluencePagesSection ticketKey={ticket.key} variant="compact" />

        {/* Development panel. Epics have no Development tab, so the "open full view"
            link is suppressed there; the inline expander still shows branch/PR data.
            Subtasks have no development workflow of their own, so the panel is omitted
            entirely (BRDG-333). */}
        {ticket.type !== "subtask" && (
          <>
            <div className="h-px bg-border-subtle" />
            <DevPanel data={devInfo} isLoading={devInfoLoading} onExpand={ticket.type === "epic" ? undefined : onNavigateToDev} />
          </>
        )}
      </div>
    </div>
    <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
