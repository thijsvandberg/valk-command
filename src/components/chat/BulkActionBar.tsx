"use client";

import { useState } from "react";
import { Trash2, MailOpen, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  onExit: () => void;
}

export default function BulkActionBar({
  selectedCount,
  totalCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onExit,
}: BulkActionBarProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  return (
    <>
      <div
        className="bulk-bar-enter sticky bottom-0 z-10 flex items-center gap-2 border-t border-border-default bg-[var(--color-surface-floating)] px-3 py-2 shadow-[var(--shadow-lg)]"
        data-testid="bulk-action-bar"
      >
        <span className="text-body-sm font-medium text-text-secondary tabular-nums whitespace-nowrap">
          {selectedCount} selected
        </span>

        <button
          type="button"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="text-body-sm text-[var(--color-brand-400)] cursor-pointer hover:underline transition-colors duration-150 whitespace-nowrap"
          data-testid="bulk-select-all-toggle"
        >
          {allSelected ? "Deselect all" : `Select all (${totalCount})`}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            iconOnly
            icon={<MailOpen className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={onMarkRead}
            disabled={selectedCount === 0}
            aria-label="Mark selected as read"
            title="Mark as read"
            data-testid="bulk-mark-read"
          />
          <Button
            variant="ghost"
            iconOnly
            icon={<Mail className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={onMarkUnread}
            disabled={selectedCount === 0}
            aria-label="Mark selected as unread"
            title="Mark as unread"
            data-testid="bulk-mark-unread"
          />
          <Button
            variant="destructive"
            iconOnly
            icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={selectedCount === 0}
            aria-label="Delete selected conversations"
            title="Delete selected"
            data-testid="bulk-delete"
          />
          <Button
            variant="ghost"
            iconOnly
            icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={onExit}
            aria-label="Exit multiselect"
            title="Exit multiselect"
            data-testid="bulk-exit"
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Delete conversations"
        description={`Are you sure you want to delete ${selectedCount} conversation${selectedCount !== 1 ? "s" : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          onDelete();
        }}
      />
    </>
  );
}
