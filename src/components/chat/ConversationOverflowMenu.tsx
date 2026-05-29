"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { MoreHorizontal, Pin, Trash2, MailOpen, Mail } from "lucide-react";

interface ConversationOverflowMenuProps {
  conversationId: string;
  conversationTitle: string;
  pinned: boolean;
  isUnread: boolean;
  onTogglePin?: (id: string, pinned: boolean) => void;
  onToggleRead?: (id: string, isUnread: boolean) => void;
  onDelete: (id: string) => void;
  /** Callback fired when the menu opens/closes, so the parent can keep the button visible */
  onOpenChange?: (open: boolean) => void;
}

export default function ConversationOverflowMenu({
  conversationId,
  conversationTitle,
  pinned,
  isUnread,
  onTogglePin,
  onToggleRead,
  onDelete,
  onOpenChange,
}: ConversationOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      onOpenChange?.(next);
      return next;
    });
  }, [onOpenChange]);

  const close = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  useOutsideClick(ref, close, { enabled: open, escapeClose: false });

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary transition-colors duration-150";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={`flex h-6 w-6 items-center justify-center rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          open
            ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
            : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
        }`}
        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        aria-label={`Actions for ${conversationTitle}`}
        data-testid="conversation-overflow-trigger"
      >
        <MoreHorizontal size={13} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
          style={{ animation: "fadeInUp 0.1s ease" }}
          role="menu"
          data-testid="conversation-overflow-menu"
        >
          {onTogglePin && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(conversationId, !pinned);
                close();
              }}
              className={itemClass}
              data-testid="overflow-pin"
            >
              <Pin size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
              {pinned ? "Unpin conversation" : "Pin conversation"}
            </button>
          )}

          {onToggleRead && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onToggleRead(conversationId, isUnread);
                close();
              }}
              className={itemClass}
              data-testid="overflow-toggle-read"
            >
              {isUnread ? (
                <>
                  <MailOpen size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
                  Mark as read
                </>
              ) : (
                <>
                  <Mail size={12} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
                  Mark as unread
                </>
              )}
            </button>
          )}

          {(onTogglePin || onToggleRead) && (
            <div className="my-1 border-t border-border-default" role="separator" />
          )}

          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(conversationId);
              close();
            }}
            className={`${itemClass} text-[var(--color-danger-400)] hover:text-[var(--color-danger-300)]`}
            data-testid="overflow-delete"
          >
            <Trash2 size={12} strokeWidth={1.5} className="shrink-0" />
            Delete conversation
          </button>
        </div>
      )}
    </div>
  );
}
