"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { TicketDetail, LinkedIssue } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { LinkIssueDialog } from "./LinkIssueDialog";
import { tickets } from "@/lib/api-client";
import { Plus, X } from "lucide-react";

interface LinkedIssuesSectionProps {
  issues: TicketDetail["linkedIssues"];
  ticketKey: string;
  onMutate: () => void;
}

export function LinkedIssuesSection({ issues, ticketKey, onMutate }: LinkedIssuesSectionProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDialogDefaults, setLinkDialogDefaults] = useState<{ targetKey?: string; relation?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState<LinkedIssue | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await tickets.deleteLink(ticketKey, {
        jiraLinkId: confirmDelete.jiraLinkId,
        linkedKey: confirmDelete.key,
      });
      onMutate();
    } catch (err) {
      console.error("Failed to delete link:", err);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  }, [confirmDelete, isDeleting, ticketKey, onMutate]);

  const openLinkDialog = useCallback((defaults?: { targetKey?: string; relation?: string }) => {
    setLinkDialogDefaults(defaults ?? {});
    setShowLinkDialog(true);
  }, []);

  const handleLinkCreated = useCallback(() => {
    setShowLinkDialog(false);
    setLinkDialogDefaults({});
    onMutate();
  }, [onMutate]);

  const grouped = issues.reduce<Record<string, LinkedIssue[]>>((acc, issue) => {
    if (!acc[issue.relation]) acc[issue.relation] = [];
    acc[issue.relation].push(issue);
    return acc;
  }, {});

  return (
    <div className="mt-8">
      <SectionHeader
        title="Linked Issues"
        count={issues.length}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={12} strokeWidth={2} />}
            onClick={() => openLinkDialog()}
            aria-label="Link issue"
          >
            Link
          </Button>
        }
      />

      {issues.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No linked items</p>
      ) : (
        <div className="mt-3 space-y-4">
          {Object.entries(grouped).map(([relation, items]) => (
            <div key={relation}>
              <div className="mb-2 text-label font-medium uppercase tracking-wider text-text-muted">
                {relation}
              </div>
              <div className="overflow-hidden rounded-lg border border-border-default">
                {items.map((item, idx) => (
                  <div
                    key={item.key}
                    className={`group flex items-center gap-3 px-3 py-2.5 ${
                      idx < items.length - 1 ? "border-b border-border-subtle" : ""
                    }`}
                  >
                    <IssueTypeIcon type={item.type} size={14} />
                    <Link
                      href={`/tickets/${item.key}`}
                      className="font-mono text-xs text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.key}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{item.title}</span>
                    <StatusBadge status={item.jiraStatus} />
                    <Avatar assignee={item.assignee} size={22} />
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(item)}
                      className="cursor-pointer rounded p-0.5 text-text-muted opacity-0 transition-opacity duration-150 hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 group-hover:opacity-100"
                      aria-label={`Remove link to ${item.key}`}
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <LinkIssueDialog
        open={showLinkDialog}
        onClose={() => { setShowLinkDialog(false); setLinkDialogDefaults({}); }}
        ticketKey={ticketKey}
        onLinked={handleLinkCreated}
        defaultTargetKey={linkDialogDefaults.targetKey}
        defaultRelation={linkDialogDefaults.relation}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remove link"
        description={confirmDelete ? `Remove the "${confirmDelete.relation}" link to ${confirmDelete.key}?` : ""}
        confirmLabel="Remove"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
