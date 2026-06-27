"use client";

import { useRef } from "react";
import { MessageSquareQuote, SendHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useOutsideClick } from "@/hooks/useOutsideClick";

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  prompt: string;
  enabled: boolean;
  /**
   * Whether this action can be sent directly via the inline send button.
   * Defaults to true. Set false for actions with no sendable prompt (e.g. ones
   * that open a panel instead of sending a message).
   */
  sendable?: boolean;
}

interface QuickActionsPopoverProps {
  actions: QuickAction[];
  onSelect: (prompt: string, actionId: string) => void;
  /**
   * Optional handler for the inline "send now" button on each row. When
   * provided, sendable actions render a send icon that fires the prompt
   * immediately instead of dropping it into the input. Omit to keep the
   * popover fill-only (e.g. the standalone chat's open-ended starters).
   */
  onSend?: (prompt: string, actionId: string) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  disabled: boolean;
}

/**
 * Footer button that opens a popover of AI quick actions. Shared between the
 * Story Writer chat (story-specific actions) and the standalone chat
 * (general-purpose actions), so the affordance stays identical everywhere.
 */
export function QuickActionsPopover({
  actions,
  onSelect,
  onSend,
  open,
  onToggle,
  onClose,
  disabled,
}: QuickActionsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useOutsideClick(popoverRef, onClose, { enabled: open });

  return (
    <div ref={popoverRef} className="relative">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        icon={<MessageSquareQuote size={14} strokeWidth={1.5} />}
        onClick={onToggle}
        disabled={disabled}
        className={`shrink-0 ${
          open
            ? "bg-overlay-strong border-border-strong text-text-primary"
            : "bg-overlay-subtle border-border-strong text-text-secondary hover:text-text-secondary hover:bg-overlay-strong"
        }`}
        title="AI actions"
        aria-label="AI actions"
      />

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-52 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-xl shadow-black/30">
          {actions.map((action) => {
            const Icon = action.icon;
            const showSend =
              !!onSend &&
              action.enabled &&
              action.sendable !== false &&
              action.prompt.trim().length > 0;
            return (
              <div
                key={action.id}
                className={`group/row flex items-center transition-colors duration-150 ${
                  action.enabled ? "hover:bg-hover-interactive" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => action.enabled && onSelect(action.prompt, action.id)}
                  disabled={!action.enabled}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-body-sm transition-colors duration-150 ${
                    action.enabled
                      ? "cursor-pointer text-text-secondary group-hover/row:text-text-primary"
                      : "cursor-not-allowed text-text-muted"
                  }`}
                >
                  <Icon size={14} strokeWidth={1.5} className="shrink-0" />
                  <span className="truncate">{action.label}</span>
                  {!action.enabled && (
                    <span className="ml-auto text-caption text-text-muted">soon</span>
                  )}
                </button>
                {showSend && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (disabled) return;
                      onSend!(action.prompt, action.id);
                    }}
                    disabled={disabled}
                    title="Send now"
                    aria-label={`Send "${action.label}" now`}
                    className="mr-1.5 flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1.5 text-text-tertiary opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-overlay-strong hover:text-[var(--color-brand-400)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] group-hover/row:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <SendHorizontal size={13} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
