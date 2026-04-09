"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Tag } from "@/components/shared/Tag";

export interface VersionOption {
  id: string;
  label: string;        // short label shown in trigger
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
      className={`flex w-full items-start gap-3 border-b border-white/[0.04] px-3.5 py-2.5 text-left cursor-pointer transition-colors duration-150 last:border-0 ${
        selected ? "bg-white/[0.05]" : "hover:bg-white/[0.035]"
      }`}
    >
      {/* Avatar or version badge */}
      <div className="mt-0.5 shrink-0">
        {hasAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={option.avatarUrl!}
            alt={option.author ?? ""}
            className="h-8 w-8 rounded-full object-cover opacity-80 ring-1 ring-white/[0.08]"
          />
        ) : (
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold tracking-tight ring-1 ${
              isDraft
                ? "bg-blue-500/10 text-blue-400/80 ring-blue-500/15"
                : "bg-white/[0.06] text-white/40 ring-white/[0.07]"
            }`}
          >
            {option.versionNum !== undefined ? `v${option.versionNum}` : "AI"}
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-white/85 leading-tight">
            {option.title ?? option.label}
          </span>
          {option.tag === "current" && (
            <Tag color="brand" className="font-semibold leading-none">Jira</Tag>
          )}
          {option.tag === "jira" && (
            <Tag color="neutral" className="leading-none">Jira</Tag>
          )}
          {option.tag === "ai-draft" && (
            <Tag color="blue" className="font-semibold leading-none">Draft</Tag>
          )}
          {option.tag === "draft" && (
            <Tag color="purple" className="font-semibold leading-none">Draft</Tag>
          )}
          {option.author && (
            <span className="text-[12px] text-white/45 truncate">{option.author}</span>
          )}
        </div>
        {option.isoDate && (
          <p className="mt-0.5 text-[11px] leading-tight text-white/30">
            {formatRichDate(option.isoDate)}
          </p>
        )}
      </div>

      {selected && (
        <Check size={13} strokeWidth={2.5} className="mt-1 shrink-0 text-[var(--color-brand-400)]" />
      )}
    </button>
  );
}

export function VersionPicker({
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === selectedId);

  const ungrouped = options.filter((o) => !o.group);
  const groupNames = Array.from(new Set(options.filter((o) => o.group).map((o) => o.group!)));

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const isDraft = selected?.tag === "draft" || selected?.tag === "ai-draft";

  return (
    <div ref={containerRef} className="relative">
      {/* Compact trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors duration-150 ${
          open
            ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.06] text-white/85"
            : "border-white/[0.10] bg-white/[0.04] text-white/65 hover:bg-white/[0.07] hover:text-white/85"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${isDraft ? "bg-blue-400" : "bg-white/30"}`}
        />
        <span className="max-w-[160px] truncate">
          {selected?.label ?? "Select version"}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180 text-white/50" : "text-white/30"}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={`absolute top-full z-[60] mt-1.5 w-72 overflow-hidden rounded-xl border border-white/[0.10] bg-[var(--color-surface-floating)] shadow-[0_16px_48px_rgba(0,0,0,0.6),0_4px_12px_rgba(0,0,0,0.3)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="max-h-[340px] overflow-y-auto">
            {ungrouped.map((o) => (
              <VersionPickerItem
                key={o.id}
                option={o}
                selected={o.id === selectedId}
                onSelect={() => { onSelect(o.id); setOpen(false); }}
              />
            ))}
            {groupNames.map((name, gi) => (
              <div key={name}>
                {(gi > 0 || ungrouped.length > 0) && (
                  <div className="mx-3.5 border-t border-white/[0.06]" />
                )}
                <div className="px-3.5 pb-1 pt-2.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-white/30">
                    {name}
                  </span>
                </div>
                {options
                  .filter((o) => o.group === name)
                  .map((o) => (
                    <VersionPickerItem
                      key={o.id}
                      option={o}
                      selected={o.id === selectedId}
                      onSelect={() => { onSelect(o.id); setOpen(false); }}
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
