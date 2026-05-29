"use client";

import { useRef } from "react";
import { MessageSquareQuote, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useOutsideClick } from "@/hooks/useOutsideClick";

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  prompt: string;
  enabled: boolean;
}

interface QuickActionsPopoverProps {
  actions: QuickAction[];
  onSelect: (prompt: string, actionId: string) => void;
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
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => action.enabled && onSelect(action.prompt, action.id)}
                disabled={!action.enabled}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150 ${
                  action.enabled
                    ? "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                    : "text-text-muted cursor-not-allowed"
                }`}
              >
                <Icon size={14} strokeWidth={1.5} className="shrink-0" />
                <span>{action.label}</span>
                {!action.enabled && (
                  <span className="ml-auto text-caption text-text-muted">soon</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
