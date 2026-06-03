"use client";

import { useCallback, type ReactNode } from "react";
import type { EpicChild, Subtask, Sprint, Ticket, JiraStatus, TicketReadiness } from "@/types/ticket";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { GroupCard } from "@/components/sprint-board/GroupCard";
import { ChildIssueRow } from "./ChildIssueRow";
import { groupChildrenBySprint } from "@/lib/epic-children-grouping";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import { Zap, CircleDot, CalendarRange } from "lucide-react";

interface EpicChildrenBySprintProps {
  /** Already filtered child issues (status filter applied by the parent). */
  items: (EpicChild | Subtask)[];
  /** Sprint metadata used to derive state, date range and ordering. */
  sprints: Sprint[];
  /** Epic key, namespaces the per-session collapse state so epics do not collide. */
  ticketKey: string;
  visibleFields: Set<string>;
  /** The sprint group already labels the sprint, so the per-row pill is suppressed. */
  renderMetadata: (child: EpicChild | Subtask, hideSprint?: boolean) => ReactNode;
  onJiraStatusChange: (childKey: string, status: JiraStatus) => void;
  onReadinessChange: (childKey: string, readiness: TicketReadiness | null) => void;
  onSelect?: (key: string) => void;
}

function isEpicChild(child: EpicChild | Subtask): child is EpicChild {
  return "storyPoints" in child;
}

// GroupStatBar reads storyPoints / businessValue / jiraStatus / type off a Ticket.
// Epic children carry no businessValue, so the BV pill and average simply do not
// render for these groups, which is acceptable for this view.
function toStatTicket(child: EpicChild | Subtask): Ticket {
  const epic = isEpicChild(child) ? child : null;
  return {
    storyPoints: epic?.storyPoints ?? null,
    businessValue: epic?.businessValue ?? null,
    jiraStatus: child.jiraStatus,
    type: child.type,
  } as unknown as Ticket;
}

const STATE_CHIP: Record<Sprint["state"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "text-[var(--color-brand-300)] bg-[var(--color-brand-500)]/15" },
  future: { label: "Future", cls: "text-text-tertiary bg-overlay-default" },
  closed: { label: "Closed", cls: "text-text-muted bg-overlay-subtle" },
  backlog: { label: "Backlog", cls: "text-text-muted bg-overlay-subtle" },
};

function SprintStateChip({ state }: { state: Sprint["state"] }) {
  const chip = STATE_CHIP[state];
  if (!chip) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chip.cls}`}>
      {chip.label}
    </span>
  );
}

export function EpicChildrenBySprint({
  items,
  sprints,
  ticketKey,
  visibleFields,
  renderMetadata,
  onJiraStatusChange,
  onReadinessChange,
  onSelect,
}: EpicChildrenBySprintProps) {
  const [collapsed, setCollapsed] = useSessionStorage<Record<string, boolean>>(
    `epic-children-collapse-${ticketKey}`,
    {},
  );

  const toggle = useCallback(
    (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] })),
    [setCollapsed],
  );

  const groups = groupChildrenBySprint(items, sprints);
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const isCollapsed = !!collapsed[group.key];
        const isUnscheduled = group.sprintName === null;
        return (
          <GroupCard
            key={group.key}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggle(group.key)}
            header={
              <GroupStatBar
                tickets={group.items.map(toStatTicket)}
                label={group.label}
                isActive={group.isActive}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => toggle(group.key)}
                showStatusCounts={false}
                leadingIcon={
                  isUnscheduled
                    ? <CircleDot size={12} />
                    : <Zap size={12} style={{ color: "var(--color-icon-sprint)" }} />
                }
              />
            }
            headerExtras={
              (group.state || group.dateRange) ? (
                <>
                  {group.state && <SprintStateChip state={group.state} />}
                  {group.dateRange && (
                    <span className="flex items-center gap-1 text-[11px] text-text-muted">
                      <CalendarRange size={11} strokeWidth={1.5} /> {group.dateRange}
                    </span>
                  )}
                </>
              ) : undefined
            }
          >
            {group.items.map((child, idx) => {
              const epic = isEpicChild(child) ? child : null;
              return (
                <ChildIssueRow
                  key={child.key}
                  item={child}
                  isLast={idx === group.items.length - 1}
                  isPending={child.key.startsWith("pending-")}
                  showTypeIcon
                  showKey={visibleFields.has("issueKey")}
                  showStatus={visibleFields.has("status")}
                  readiness={epic?.readiness}
                  onJiraStatusChange={(s) => onJiraStatusChange(child.key, s)}
                  onReadinessChange={(r) => onReadinessChange(child.key, r)}
                  onSelect={onSelect}
                  metadataSlot={renderMetadata(child, true)}
                />
              );
            })}
          </GroupCard>
        );
      })}
    </div>
  );
}
