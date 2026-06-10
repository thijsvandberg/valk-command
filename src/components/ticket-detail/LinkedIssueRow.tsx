"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LinkedIssue, Ticket } from "@/types/ticket";
import { ChildIssueRow } from "./ChildIssueRow";
import { Avatar } from "@/components/shared/Avatar";
import { useLinkedTicketData } from "@/hooks/useTicketHoverData";

interface LinkedIssueRowProps {
  item: LinkedIssue;
  isLast: boolean;
  isPending: boolean;
  isActive: boolean;
  onSelect?: (key: string, e: React.MouseEvent) => void;
  /** The ticket from the shared board list, if it's on a synced sprint. When
      absent, the row fetches details on hover instead. */
  boardTicket: Ticket | undefined;
  actionsSlot?: ReactNode;
}

// A linked-issue row that refreshes itself from live ticket data instead of the
// cached link snapshot: the inline status/title/assignee and the hover card both
// reflect the board ticket when available, and otherwise the ticket fetched on
// hover. This keeps the page in sync with Jira without re-syncing the parent.
export function LinkedIssueRow({ item, isLast, isPending, isActive, onSelect, boardTicket, actionsSlot }: LinkedIssueRowProps) {
  const [primed, setPrimed] = useState(false);
  const live = useLinkedTicketData(item.key, boardTicket, primed);

  // Prefer live fields, falling back to the cached link snapshot until they load.
  const displayItem = useMemo(() => ({
    ...item,
    title: live.title ?? item.title,
    type: live.type ?? item.type,
    jiraStatus: live.jiraStatus ?? item.jiraStatus,
    assignee: live.assignee !== undefined ? live.assignee : item.assignee,
  }), [item, live]);

  return (
    <ChildIssueRow
      item={displayItem}
      isLast={isLast}
      isPending={isPending}
      onSelect={!isPending ? onSelect : undefined}
      isActive={isActive}
      showTypeIcon
      showKey
      showStatus
      readiness={live.hoverData?.readiness ?? null}
      hoverData={live.hoverData}
      onMouseEnter={() => setPrimed(true)}
      metadataSlot={<Avatar assignee={displayItem.assignee} size={22} />}
      actionsSlot={actionsSlot}
    />
  );
}
