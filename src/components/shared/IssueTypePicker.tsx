"use client";

import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { BasePicker } from "@/components/shared/BasePicker";
import type { IssueType } from "@/types/ticket";

const SELECTABLE_TYPES: IssueType[] = ["story", "bug", "task", "spike"];

const TYPE_LABELS: Partial<Record<IssueType, string>> = {
  story: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
};

interface IssueTypePickerProps {
  type: IssueType | string;
  size?: number;
  onTypeChange: (newType: IssueType) => void;
}

export function IssueTypePicker({ type, size = 16, onTypeChange }: IssueTypePickerProps) {
  return (
    <BasePicker.Root portal={false}>
      <BasePicker.Trigger
        title="Change issue type"
        className="flex items-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        {({ open }) => (
          <span
            style={{ opacity: open ? 1 : undefined, transition: "opacity 0.12s ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = ""; }}
          >
            <IssueTypeIcon type={type} size={size} />
          </span>
        )}
      </BasePicker.Trigger>

      <BasePicker.Popover
        width="w-[118px]"
        className="overflow-hidden rounded-lg"
        style={{ animation: "issue-picker-in 0.12s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <style>{`
          @keyframes issue-picker-in {
            from { opacity: 0; transform: translateY(-4px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
          }
        `}</style>
        <div className="p-1">
          {SELECTABLE_TYPES.map((t) => {
            const active = t === type;
            const color = ISSUE_TYPE_COLORS[t];
            return (
              <BasePicker.Item
                key={t}
                selected={false}
                onSelect={() => onTypeChange(t)}
              >
                <span
                  className="flex w-full items-center gap-2 rounded-md text-label font-medium"
                  style={{
                    color: active ? color : "var(--color-text-secondary)",
                  }}
                >
                  <IssueTypeIcon type={t} size={12} />
                  <span>{TYPE_LABELS[t]}</span>
                  {active && (
                    <span
                      className="ml-auto h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: color, boxShadow: `0 0 4px ${color}80` }}
                    />
                  )}
                </span>
              </BasePicker.Item>
            );
          })}
        </div>
      </BasePicker.Popover>
    </BasePicker.Root>
  );
}
