"use client";

import { ChevronDown, Check } from "lucide-react";
import { BasePicker } from "@/components/shared/BasePicker";
import { Tag } from "@/components/shared/Tag";

export interface VersionOption {
  id: string;
  label: string;
  versionNum?: number;
  title?: string;
  author?: string | null;
  avatarUrl?: string | null;
  isoDate?: string;
  tag?: "current" | "jira" | "ai-draft" | "draft";
  group?: string;
}

function formatRichDate(iso: string): string {
  const raw = iso.endsWith("Z") ? iso : `${iso}Z`;
  return new Date(raw).toLocaleString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function VersionPickerItem({
  option,
  selected,
  onSelect,
}: {
  option: VersionOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const hasAvatar = !!option.avatarUrl;
  const isDraft = option.tag === "draft" || option.tag === "ai-draft";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 border-b border-border-subtle px-3.5 py-2.5 text-left cursor-pointer transition-colors duration-150 last:border-0 ${
        selected ? "bg-overlay-default" : "hover:bg-overlay-subtle"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {hasAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={option.avatarUrl!}
            alt={option.author ?? ""}
            className="h-8 w-8 rounded-full object-cover opacity-80 ring-1 ring-border-strong"
          />
        ) : (
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-caption font-bold tracking-tight ring-1 ${
              isDraft
                ? "bg-blue-500/10 text-blue-400/80 ring-blue-500/15"
                : "bg-overlay-default text-text-tertiary ring-border-default"
            }`}
          >
            {option.versionNum !== undefined ? `v${option.versionNum}` : "AI"}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-body font-semibold text-text-primary leading-tight">
            {option.title ?? option.label}
          </span>
          {option.tag === "current" && <Tag color="brand" className="font-semibold leading-none">Jira</Tag>}
          {option.tag === "jira" && <Tag color="neutral" className="leading-none">Jira</Tag>}
          {option.tag === "ai-draft" && <Tag color="blue" className="font-semibold leading-none">Draft</Tag>}
          {option.tag === "draft" && <Tag color="purple" className="font-semibold leading-none">Draft</Tag>}
          {option.author && <span className="text-body-sm text-text-tertiary truncate">{option.author}</span>}
        </div>
        {option.isoDate && (
          <p className="mt-0.5 text-label leading-tight text-text-tertiary">{formatRichDate(option.isoDate)}</p>
        )}
      </div>

      {selected && <Check size={13} strokeWidth={2.5} className="mt-1 shrink-0 text-[var(--color-brand-400)]" />}
    </button>
  );
}

export function VersionPickerV2({
  options,
  selectedId,
  onSelect,
  align = "left",
}: {
  options: VersionOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  align?: "left" | "right";
}) {
  return (
    <BasePicker.Root portal={false} align={align}>
      <VersionPickerInner options={options} selectedId={selectedId} onSelect={onSelect} />
    </BasePicker.Root>
  );
}

function VersionPickerInner({
  options,
  selectedId,
  onSelect,
}: {
  options: VersionOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { open, handleClose } = BasePicker.useContext();
  const selected = options.find((o) => o.id === selectedId);
  const ungrouped = options.filter((o) => !o.group);
  const groupNames = Array.from(new Set(options.filter((o) => o.group).map((o) => o.group!)));
  const isDraft = selected?.tag === "draft" || selected?.tag === "ai-draft";

  return (
    <>
      <BasePicker.Trigger
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors duration-150 ${
          open
            ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.06] text-text-primary"
            : "border-border-strong bg-overlay-subtle text-text-secondary hover:bg-overlay-default hover:text-text-primary"
        }`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isDraft ? "bg-blue-400" : "bg-overlay-strong"}`} />
        <span className="max-w-[160px] truncate">{selected?.label ?? "Select version"}</span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180 text-text-secondary" : "text-text-tertiary"}`}
        />
      </BasePicker.Trigger>

      <BasePicker.Popover width="w-72" className="overflow-hidden shadow-[var(--shadow-modal)] border-border-strong">
        <div className="max-h-[340px] overflow-y-auto">
          {ungrouped.map((o) => (
            <VersionPickerItem
              key={o.id}
              option={o}
              selected={o.id === selectedId}
              onSelect={() => { onSelect(o.id); handleClose(); }}
            />
          ))}
          {groupNames.map((name, gi) => (
            <div key={name}>
              {(gi > 0 || ungrouped.length > 0) && <div className="mx-3.5 border-t border-border-default" />}
              <div className="px-3.5 pb-1 pt-2.5">
                <span className="text-caption font-medium uppercase tracking-[0.07em] text-text-tertiary">{name}</span>
              </div>
              {options.filter((o) => o.group === name).map((o) => (
                <VersionPickerItem
                  key={o.id}
                  option={o}
                  selected={o.id === selectedId}
                  onSelect={() => { onSelect(o.id); handleClose(); }}
                />
              ))}
            </div>
          ))}
        </div>
      </BasePicker.Popover>
    </>
  );
}
