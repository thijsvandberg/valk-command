"use client";

import { useRef } from "react";
import { Loader2, AlertTriangle, Flag } from "lucide-react";
import type { Ticket, TicketDetail } from "@/types/ticket";
import { Avatar } from "@/components/shared/Avatar";
import { EditableTitle } from "./EditableTitle";
import { EditableDescription } from "./EditableDescription";
import { AttachmentsSection } from "./AttachmentsSection";
import { SubtasksSection } from "./SubtasksSection";
import { LinkedIssuesSection } from "./LinkedIssuesSection";
import { EpicChildrenSection } from "./EpicChildrenSection";
import { CommentsSection } from "./CommentsSection";
import { Tab } from "@/components/shared/TabBar";
import dynamic from "next/dynamic";

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} strokeWidth={1.5} className="animate-spin text-text-muted" />
    </div>
  );
}

const TicketHistory = dynamic(
  () => import("./TicketHistory").then((m) => ({ default: m.TicketHistory })),
  { loading: TabLoadingFallback },
);
const TicketReview = dynamic(
  () => import("./TicketReview").then((m) => ({ default: m.TicketReview })),
  { loading: TabLoadingFallback },
);
const TicketDevelopment = dynamic(
  () => import("./TicketDevelopment").then((m) => ({ default: m.TicketDevelopment })),
  { loading: TabLoadingFallback },
);

export type TicketTab = "content" | "history" | "review" | "development";

export interface TicketTabContentProps {
  // Layout context: "page" centers content in a max-w-4xl column with wide
  // padding; "panel" fills the narrow side panel with tighter padding.
  layout?: "page" | "panel";
  // When false, the internal tab bar is not rendered; the host renders its own
  // (e.g. the side panel merges the tabs into its full-width header bar).
  renderTabBar?: boolean;
  // Optional actions rendered on the right of the tab bar row. The side panel
  // passes its header buttons here so the whole bar (tabs + actions) scrolls
  // with the content instead of staying pinned.
  tabBarActions?: React.ReactNode;
  // Fires when the scroll container crosses the tab-bar height, i.e. once the
  // tab bar has scrolled out of view. The side panel uses this to reveal a
  // floating close button.
  onScrolledChange?: (scrolled: boolean) => void;
  // Extra content rendered at the end of the Content tab, inside the same
  // scroll. Used by the side panel to stack the meta block below the content
  // when too narrow for a separate meta column.
  metaContent?: React.ReactNode;
  ticketKey: string;
  ticket: Ticket;
  detail: TicketDetail | undefined;
  localEdits: Record<string, { value: string; isDraft: boolean }> | undefined;
  activeTab: TicketTab;
  onActiveTabChange: (tab: TicketTab) => void;
  // Editing
  draftDiscardKey: number;
  isTitleEditing: boolean;
  isDescEditing: boolean;
  onTitleEditingChange: (editing: boolean) => void;
  onDescEditingChange: (editing: boolean) => void;
  onTitleLocalEdit: (has: boolean) => void;
  onDescLocalEdit: (has: boolean) => void;
  // Conflict
  showConflictWarning: boolean;
  showConflictDiff: boolean;
  autoOpenDraftDiff: boolean;
  metadataOnlyConflict: boolean;
  onViewDiff: () => void;
  isDiscarding: boolean;
  discardError: string | null;
  // Push
  isPushing: boolean;
  pushError: string | null;
  overrideConfirmed: boolean;
  onOverrideChange: (v: boolean) => void;
  // Handlers
  onDiscardDraft: () => Promise<void>;
  onPushToJira: () => Promise<void>;
  onMutate: () => void;
  onConflictResolved: () => Promise<void>;
  onSelectTicket: (key: string) => void;
  // Badge counts
  reviewCount: number;
  versionCount: number;
  historyResetKey: number;
  isFlagged: boolean;
}

export function TicketTabContent({
  layout = "page",
  renderTabBar = true,
  tabBarActions,
  onScrolledChange,
  metaContent,
  ticketKey,
  ticket,
  detail,
  localEdits,
  activeTab,
  onActiveTabChange,
  draftDiscardKey,
  isTitleEditing,
  isDescEditing,
  onTitleEditingChange,
  onDescEditingChange,
  onTitleLocalEdit,
  onDescLocalEdit,
  showConflictWarning,
  showConflictDiff,
  autoOpenDraftDiff,
  metadataOnlyConflict,
  onViewDiff,
  isDiscarding,
  discardError,
  isPushing,
  pushError,
  overrideConfirmed,
  onOverrideChange,
  onDiscardDraft,
  onPushToJira,
  onMutate,
  onConflictResolved,
  onSelectTicket,
  reviewCount,
  versionCount,
  historyResetKey,
  isFlagged,
}: TicketTabContentProps) {
  const isPanel = layout === "panel";
  const railClass = isPanel ? "w-full px-5" : "mx-auto w-full max-w-4xl px-8";
  // The toolbar and diff footer render into these portals by id. When a panel
  // instance shares the page with the full ticket page (the child preview side
  // panel), the ids must differ so each editor finds its own surface instead of
  // the first match in the document.
  const toolbarPortalId = isPanel ? "ticket-toolbar-portal-panel" : "ticket-toolbar-portal";
  const diffFooterPortalId = isPanel ? "diff-footer-portal-panel" : "diff-footer-portal";

  // Track whether the tab bar has scrolled out of view (bar is h-[44px]).
  const wasScrolledRef = useRef(false);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!onScrolledChange) return;
    const next = e.currentTarget.scrollTop > 44;
    if (next !== wasScrolledRef.current) {
      wasScrolledRef.current = next;
      onScrolledChange(next);
    }
  };

  return (
    <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
      <div onScroll={handleScroll} className="flex flex-1 flex-col overflow-y-auto" style={{ overflowX: "hidden", scrollbarGutter: "stable" }}>
        {/* Tab bar scrolls with the content rather than staying pinned. The side
            panel passes its header buttons via tabBarActions so the whole merged
            bar scrolls away, leaving a floating close behind. */}
        {renderTabBar && (
          <div className={`flex h-[44px] shrink-0 items-stretch gap-1 border-b border-border-default ${railClass}`}>
            {([
                { id: "content" as const, label: "Content", badge: undefined as number | undefined, badgeHighlight: false },
                { id: "history" as const, label: "History", badge: versionCount as number | undefined, badgeHighlight: false },
                { id: "review" as const, label: "Review", badge: (reviewCount || undefined) as number | undefined, badgeHighlight: (reviewCount ?? 0) > 0 },
                { id: "development" as const, label: "Development", badge: undefined as number | undefined, badgeHighlight: false },
              ]).map((tab) => (
                <Tab
                  key={tab.id}
                  active={activeTab === tab.id}
                  onClick={() => onActiveTabChange(tab.id)}
                  label={tab.label}
                  badge={tab.badge}
                  badgeHighlight={tab.badgeHighlight}
                />
              ))}
              {tabBarActions && (
                <div className="ml-auto flex shrink-0 items-center gap-1">{tabBarActions}</div>
              )}
          </div>
        )}

        {/* Editor toolbar portals in here, directly under the tab bar and sticky
            so formatting stays reachable while scrolling a long body. empty:hidden
            keeps it out of the layout until the editor mounts its toolbar. */}
        <div
          id={toolbarPortalId}
          className={`sticky top-0 z-10 border-b border-border-default bg-[var(--color-surface-elevated)] empty:hidden ${railClass}`}
        />

        <div className={`${railClass} ${activeTab === "history" ? "pt-6 pb-4" : "py-6"}`}>

          {/* Conflict warning */}
          {showConflictWarning && (
            <div className="mt-3 flex w-full flex-col gap-2 rounded-lg border border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/[0.06] px-4 py-3">
              <div className="flex w-full items-start gap-2.5">
                <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[var(--color-status-warning)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-lg font-medium text-[var(--color-status-warning)]">Conflict</p>
                  <p className="mt-0.5 text-body-sm text-text-tertiary">
                    Jira was updated since your local edit. Click to review and resolve.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={onDiscardDraft}
                    disabled={isDiscarding}
                    className="cursor-pointer rounded px-2.5 py-1 text-body-sm font-medium text-text-secondary hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-strong disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                  >
                    {isDiscarding ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        Accepting...
                      </span>
                    ) : "Accept Jira version"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onActiveTabChange("history")}
                    disabled={isDiscarding}
                    className="cursor-pointer rounded px-2.5 py-1 text-body-sm font-medium text-[var(--color-status-warning)]/80 hover:bg-[var(--color-status-warning)]/10 hover:text-[var(--color-status-warning)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-status-warning)]/50 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                  >
                    Review diff
                  </button>
                </div>
              </div>
              {discardError && (
                <p className="text-body-sm text-red-500">{discardError}</p>
              )}
            </div>
          )}

          {/* Content tab */}
          {activeTab === "content" && (
            <div className={isDescEditing ? "hidden" : "mt-3"}>
              <div className="mt-3 flex items-start gap-2.5">
                <EditableTitle
                  key={draftDiscardKey}
                  ticketKey={ticketKey}
                  initialTitle={ticket.title}
                  serverLocalEdit={localEdits?.title}
                  onLocalEdit={onTitleLocalEdit}
                  onEditingChange={onTitleEditingChange}
                  onViewDiff={onViewDiff}
                  onSaved={onMutate}
                />
              </div>
              {ticket.assignee && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-body-sm">
                  <span className="flex items-center gap-1.5 text-text-tertiary">
                    <Avatar assignee={ticket.assignee} size={18} />
                    <span className="truncate">{ticket.assignee.name}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Flagged banner */}
          {activeTab === "content" && isFlagged && (() => {
            const flagComment = detail?.jiraComments
              ?.slice().reverse()
              .find((c) => /flag_on|Flag added/i.test(c.content));
            const flagReason = flagComment?.content
              ?.replace(/^:?flag_on:?\s*Flag added\s*/i, "")
              ?.trim() || null;
            return (
              <div className="mt-4 rounded-lg border border-[var(--color-status-error)]/20 bg-[var(--color-status-error)]/[0.04] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Flag size={14} strokeWidth={1.5} className="shrink-0 text-[var(--color-status-error)]" fill="var(--color-status-error)" />
                  <span className="text-body-lg font-semibold text-[var(--color-status-error)]">Flagged</span>
                  {flagComment && (
                    <span className="text-body-sm text-text-muted">
                      by {flagComment.authorName}, {new Date(flagComment.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {flagReason && (
                  <div className="mt-2 text-body-lg leading-relaxed text-text-secondary">
                    {flagReason.split(/\n{2,}/).map((para, i) => {
                      const parts = para.split(/(\[.*?\]\(.*?\)|https?:\/\/\S+)/g);
                      const elements = parts.map((part, j) => {
                        const mdLink = part.match(/^\[(.*?)\]\((.*?)\)$/);
                        if (mdLink) return <a key={j} href={mdLink[2]} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand-400)] underline decoration-[var(--color-brand-400)]/30 hover:decoration-[var(--color-brand-400)]">{mdLink[1]}</a>;
                        if (/^https?:\/\/\S+$/.test(part)) return <a key={j} href={part} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand-400)] underline decoration-[var(--color-brand-400)]/30 hover:decoration-[var(--color-brand-400)] break-all">{part}</a>;
                        return part;
                      });
                      return <p key={i} className={i > 0 ? "mt-2" : ""}>{elements}</p>;
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === "content" && (
            <>
              <EditableDescription
                key={draftDiscardKey}
                ticketKey={ticketKey}
                initialDescription={detail?.description ?? "No description available."}
                serverLocalEdit={localEdits?.description}
                attachments={detail?.attachments}
                onLocalEdit={onDescLocalEdit}
                onEditingChange={onDescEditingChange}
                onDiscard={onDiscardDraft}
                onPushToJira={onPushToJira}
                isPushing={isPushing}
                pushError={pushError}
                showConflictWarning={showConflictWarning}
                overrideConfirmed={overrideConfirmed}
                onOverrideChange={onOverrideChange}
                toolbarPortalId={toolbarPortalId}
              />
              {detail && <AttachmentsSection attachments={detail.attachments} />}
              {ticket?.type === "epic"
                ? detail && <EpicChildrenSection items={detail.epicChildren} ticketKey={ticketKey} onMutate={onMutate} onSelectTicket={onSelectTicket} />
                : <>
                    {detail && <SubtasksSection subtasks={detail.subtasks} ticketKey={ticketKey} onMutate={onMutate} onSelectTicket={onSelectTicket} />}
                    {detail && <LinkedIssuesSection issues={detail.linkedIssues} ticketKey={ticketKey} onMutate={onMutate} />}
                  </>
              }
              {/* Stacked meta (panel only) sits above the comments so the PO
                  metadata stays close to the content rather than below the
                  Jira conversation. */}
              {metaContent && <div className="mt-6">{metaContent}</div>}
              <CommentsSection
                ticketKey={ticketKey}
                jiraComments={detail?.jiraComments ?? []}
                onMutate={onMutate}
              />
            </>
          )}

          {activeTab === "history" && (
            <TicketHistory
              ticket={ticket}
              diffFooterPortalId={diffFooterPortalId}
              showConflictDiff={showConflictDiff}
              autoOpenDraftDiff={autoOpenDraftDiff}
              metadataOnlyConflict={metadataOnlyConflict}
              resetKey={historyResetKey}
              onConflictResolved={async (): Promise<void> => {
                await onConflictResolved();
                onActiveTabChange("content");
              }}
            />
          )}
          {activeTab === "review" && <TicketReview ticketKey={ticketKey} />}
          {activeTab === "development" && <TicketDevelopment ticketKey={ticketKey} />}

          {activeTab !== "history" && <div className="h-12" />}
        </div>
        <div id={diffFooterPortalId} className="sticky bottom-0 z-10 mt-auto empty:hidden" />
      </div>
    </div>
  );
}
