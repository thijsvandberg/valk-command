"use client";

import { useState, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { Search, SlidersHorizontal, X, ListFilter, Check } from "lucide-react";
import { ChildIssueRow } from "@/components/ticket-detail/ChildIssueRow";
import { EpicBadge, SubtaskCountBadge, InRefinementBadge, SprintBadge } from "@/components/shared/IssueMetaBadges";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { EditStateDot } from "@/components/sprint-board/TicketTableCells";
import { RefinementFilters } from "./RefinementFilters";
import { useSectionVisibility } from "@/hooks/useSectionVisibility";
import type { useRefinementFilters } from "@/hooks/useRefinementFilters";
import type { useRefinementQueue } from "@/hooks/useRefinementQueue";
import type { Ticket, Sprint, JiraStatus, TicketReadiness } from "@/types/ticket";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";

const PILL_FIELDS = [
  { id: "issueType", label: "Type icon" },
  { id: "key", label: "Ticket key" },
  { id: "status", label: "Status badge" },
  { id: "epic", label: "Epic" },
  { id: "subtasks", label: "Subtask count" },
  { id: "sp", label: "Story points" },
  { id: "bv", label: "Business value" },
  { id: "sprint", label: "Sprint" },
];

interface RefinementTicketListProps {
  availableTickets: Ticket[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: ReturnType<typeof useRefinementFilters>;
  queueHook: ReturnType<typeof useRefinementQueue>;
  /** Open a ticket in the side panel. Distinct from the checkbox, which builds the queue. */
  onSelectTicket: (key: string) => void;
  pinnedSprintIds: Set<string>;
  epicOptions: string[];
  sprintNameMap: Record<string, string>;
  ticketSessionMap: Map<string, { id: string; name: string }[]>;
  resolvedSessionId: string | null;
  sprints?: Sprint[];
  /** Optimistic readiness overrides keyed by ticket key, layered over the persisted value. */
  readinessMap?: Record<string, TicketReadiness | null>;
  onAssigneeChange?: (key: string, user: AssignableUser | null) => void;
  onEpicChange?: (key: string, epic: EpicOption | null) => void;
  onSprintChange?: (key: string, sprintId: string | null) => void;
  onStoryPointsChange?: (key: string, value: number | null) => void;
  onBusinessValueChange?: (key: string, value: number | null) => void;
  onJiraStatusChange?: (key: string, status: JiraStatus) => void;
  onReadinessChange?: (key: string, readiness: TicketReadiness | null) => void;
}

export function RefinementTicketList({
  availableTickets,
  searchQuery,
  onSearchChange,
  filters,
  queueHook,
  onSelectTicket,
  pinnedSprintIds,
  epicOptions,
  sprintNameMap,
  ticketSessionMap,
  resolvedSessionId,
  sprints,
  readinessMap,
  onAssigneeChange,
  onEpicChange,
  onSprintChange,
  onStoryPointsChange,
  onBusinessValueChange,
  onJiraStatusChange,
  onReadinessChange,
}: RefinementTicketListProps) {
  const { visible: pillFields, toggleField: togglePillField } = useSectionVisibility("refinement-pill", ["issueType", "key", "status", "epic", "subtasks", "sp", "bv", "sprint"]);
  const [pillSettingsOpen, setPillSettingsOpen] = useState(false);
  const pillSettingsRef = useRef<HTMLDivElement>(null);

  useOutsideClick(pillSettingsRef, () => setPillSettingsOpen(false), { enabled: pillSettingsOpen });

  const showIssueType = pillFields.has("issueType");
  const showKey = pillFields.has("key");
  const showStatus = pillFields.has("status");
  const showEpic = pillFields.has("epic");
  const showSubtasks = pillFields.has("subtasks");
  const showSp = pillFields.has("sp");
  const showBv = pillFields.has("bv");
  const showSprint = pillFields.has("sprint");

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 flex min-h-7 items-center gap-3">
        <h2 className="shrink-0 font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">Select tickets</h2>
        {queueHook.readyCount > 0 && (
          <button
            type="button"
            onClick={queueHook.handleToggleReadyToRefine}
            className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-status-done)] active:opacity-70 ${
              queueHook.allReadySelected
                ? "bg-[var(--color-status-done)] text-white hover:bg-[#1ea34d]"
                : "bg-[var(--color-status-done-subtle)] text-[var(--color-status-done)] hover:bg-[color-mix(in_srgb,var(--color-status-done)_20%,transparent)]"
            }`}
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, opacity 0.1s ease" }}
            title={queueHook.allReadySelected ? "Click to deselect all ready-to-refine tickets" : "Click to select all ready-to-refine tickets"}
          >
            {queueHook.readyCount} ready to refine
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-default bg-overlay-subtle px-3 py-2">
        <Search size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search tickets..." className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none" />
        {searchQuery && (
          <button type="button" onClick={() => onSearchChange("")} className="cursor-pointer text-text-muted hover:text-text-secondary">
            <X size={13} strokeWidth={2} />
          </button>
        )}
        <div className="relative" ref={pillSettingsRef}>
          <button
            type="button"
            onClick={() => setPillSettingsOpen((v) => !v)}
            className={`flex cursor-pointer items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              pillSettingsOpen ? "text-[var(--color-brand-400)]" : "text-text-muted hover:text-text-secondary"
            }`}
            style={{ transition: "color 0.12s ease" }}
            title="Pill display settings"
          >
            <SlidersHorizontal size={15} strokeWidth={1.5} />
          </button>
          {pillSettingsOpen && (
            <div
              className="absolute top-full right-0 z-50 mt-1 min-w-[160px] rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
              style={{ animation: "fadeInUp 0.1s ease" }}
            >
              <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
                Pill display
              </div>
              {PILL_FIELDS.map((field) => {
                const isVisible = pillFields.has(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => togglePillField(field.id, !isVisible)}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        isVisible
                          ? "border-[var(--color-brand-400)] bg-[var(--color-brand-400)]"
                          : "border-border-default bg-transparent"
                      }`}
                      style={{ transition: "background-color 0.1s ease, border-color 0.1s ease" }}
                    >
                      {isVisible && <Check size={10} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className="text-text-secondary">{field.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => filters.setFiltersOpen(!filters.filtersOpen)}
          className={`relative flex cursor-pointer items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
            filters.filtersOpen ? "text-[var(--color-brand-400)]" : "text-text-muted hover:text-text-secondary"
          }`}
          style={{ transition: "color 0.12s ease" }}
          title="Toggle filters"
        >
          <ListFilter size={15} strokeWidth={1.5} />
          {filters.activeFilterCount > 0 && !filters.filtersOpen && (
            <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-0.5 text-[9px] font-semibold text-white">
              {filters.activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {filters.filtersOpen && <RefinementFilters filters={filters} pinnedSprintIds={pinnedSprintIds} epicOptions={epicOptions} />}

      {/* Ticket list — unified ChildIssueRow with the shared 18px metadata badges. */}
      {availableTickets.length > 0 ? (
        <div className="overflow-clip rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)]">
          {availableTickets.map((ticket, idx) => {
            const sprintName = ticket.sprintId ? (sprintNameMap[ticket.sprintId] ?? null) : null;
            const sessionNames = ticketSessionMap.get(ticket.key)?.filter((s) => s.id !== resolvedSessionId).map((s) => s.name);
            const isOtherSession = (ticketSessionMap.get(ticket.key)?.some((s) => s.id !== resolvedSessionId)) ?? false;
            const isChecked = queueHook.queue.includes(ticket.key);
            const readiness = (readinessMap?.[ticket.key] ?? ticket.readiness) ?? null;
            const metadata = (
              <div className="flex shrink-0 items-center gap-1.5">
                {ticket.editState === "draft" && <EditStateDot state="draft" />}
                {ticket.editState === "local_edits" && <EditStateDot state="local_edits" />}
                {ticket.editState === "conflict" && <EditStateDot state="conflict" />}
                {showEpic && ticket.epic && <EpicBadge epic={ticket.epic} />}
                {showSubtasks && <SubtaskCountBadge open={ticket.openSubtaskCount ?? 0} total={ticket.totalSubtaskCount ?? 0} />}
                <InRefinementBadge sessionNames={sessionNames} />
                {isChecked && isOtherSession && (
                  <span className="shrink-0 text-[11px] leading-none text-amber-400/70">In other session</span>
                )}
                {showSprint && <SprintBadge name={sprintName} />}
                {showBv && ticket.businessValue != null && (
                  <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    <BusinessValuePicker
                      value={ticket.businessValue}
                      onChange={(v) => onBusinessValueChange?.(ticket.key, v)}
                      dense
                      showMetricIcon
                      richTooltip
                    />
                  </span>
                )}
                {showSp && ticket.storyPoints != null && (
                  <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    <StoryPointPicker
                      value={ticket.storyPoints}
                      onChange={(v) => onStoryPointsChange?.(ticket.key, v)}
                      dense
                      showMetricIcon
                      richTooltip
                    />
                  </span>
                )}
              </div>
            );
            return (
              <ChildIssueRow
                key={ticket.key}
                item={ticket}
                isLast={idx === availableTickets.length - 1}
                spacious
                inlineCheckbox
                showTypeIcon={showIssueType}
                showKey={showKey}
                showStatus={showStatus}
                readiness={readiness}
                onJiraStatusChange={onJiraStatusChange ? (s) => onJiraStatusChange(ticket.key, s) : undefined}
                onReadinessChange={onReadinessChange ? (r) => onReadinessChange(ticket.key, r) : undefined}
                selectable
                isChecked={isChecked}
                someChecked={queueHook.queue.length > 0}
                onCheckboxClick={(e) => queueHook.toggleTicket(ticket.key, idx, e.shiftKey)}
                onSelect={(key) => onSelectTicket(key)}
                sprints={sprints}
                onAssigneeChange={onAssigneeChange ? (u) => onAssigneeChange(ticket.key, u) : undefined}
                onEpicChange={onEpicChange ? (epic) => onEpicChange(ticket.key, epic) : undefined}
                onSprintChange={onSprintChange ? (s) => onSprintChange(ticket.key, s) : undefined}
                onStoryPointsChange={onStoryPointsChange ? (v) => onStoryPointsChange(ticket.key, v) : undefined}
                onBusinessValueChange={onBusinessValueChange ? (v) => onBusinessValueChange(ticket.key, v) : undefined}
                hoverData={{
                  title: ticket.title,
                  storyPoints: ticket.storyPoints,
                  businessValue: ticket.businessValue,
                  sprintId: ticket.sprintId ?? null,
                  sprintName,
                  epicKey: ticket.epicKey,
                  epic: ticket.epic,
                  assignee: ticket.assignee ?? null,
                  reporter: ticket.reporter ?? null,
                  openSubtaskCount: ticket.openSubtaskCount ?? 0,
                  totalSubtaskCount: ticket.totalSubtaskCount ?? 0,
                  flagged: ticket.flagged,
                  readiness,
                  qualityScore: ticket.qualityScore,
                  notes: ticket.notes || null,
                }}
                metadataSlot={metadata}
              />
            );
          })}
        </div>
      ) : (
        <p className="py-8 text-center text-body-lg text-text-muted">
          {searchQuery ? <>No tickets match &ldquo;{searchQuery}&rdquo;</> : "No tickets match the current filters."}
        </p>
      )}
    </div>
  );
}
