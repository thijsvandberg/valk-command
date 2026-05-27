"use client";

import { useCallback } from "react";
import { Plus, MessageCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BasePicker } from "@/components/shared/BasePicker";
import type { ConversationType } from "@/types/chat";

interface ConversationTypePickerProps {
  onCreate: (type: ConversationType) => void;
  collapsed?: boolean;
}

const options: { type: ConversationType; label: string; icon: React.ReactNode }[] = [
  {
    type: "chat",
    label: "Chat",
    icon: <MessageCircle size={14} strokeWidth={1.5} />,
  },
  {
    type: "investigation",
    label: "Investigation",
    icon: <Search size={14} strokeWidth={1.5} />,
  },
];

export default function ConversationTypePicker({ onCreate, collapsed }: ConversationTypePickerProps) {
  return (
    <BasePicker.Root portal={false}>
      <ConversationTypePickerInner onCreate={onCreate} />
    </BasePicker.Root>
  );
}

function ConversationTypePickerInner({ onCreate }: { onCreate: (type: ConversationType) => void }) {
  const { handleClose } = BasePicker.useContext();

  const handleSelect = useCallback(
    (type: ConversationType) => {
      handleClose();
      onCreate(type);
    },
    [onCreate, handleClose],
  );

  return (
    <>
      <BasePicker.Trigger className="inline-flex" aria-label="New conversation">
        {({ open }) => (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary active:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]" style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}>
            <Plus className="h-4 w-4" strokeWidth={2} />
          </span>
        )}
      </BasePicker.Trigger>

      <BasePicker.Popover width="min-w-[180px]" className="rounded-lg border-border-strong shadow-[var(--shadow-lg)]">
        <div className="p-1" role="menu">
          {options.map((opt) => (
            <button
              key={opt.type}
              type="button"
              role="menuitem"
              onClick={() => handleSelect(opt.type)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-[var(--font-body)] text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary active:bg-overlay-strong transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)]"
            >
              <span className="text-text-tertiary">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </BasePicker.Popover>
    </>
  );
}
