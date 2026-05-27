"use client";

import { useMemo } from "react";
import { BasePicker } from "@/components/shared/BasePicker";
import { Tag } from "@/components/shared/Tag";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";

export function LabelPicker({
  value,
  onChange,
  align = "right",
}: {
  value: string[];
  onChange: (labels: string[]) => void;
  align?: "left" | "right";
}) {
  return (
    <BasePicker.Root portal={true} align={align} popoverHeight={340}>
      <LabelPickerInner value={value} onChange={onChange} />
    </BasePicker.Root>
  );
}

function LabelPickerInner({
  value,
  onChange,
}: {
  value: string[];
  onChange: (labels: string[]) => void;
}) {
  const { open, query } = BasePicker.useContext();

  const { data } = useSWR<{ labels: string[] }>(
    open ? "/api/jira/labels" : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const labels = data?.labels ?? [];

  const filtered = useMemo(() => {
    if (!query.trim()) return labels;
    const q = query.toLowerCase();
    return labels.filter((l) => l.toLowerCase().includes(q));
  }, [labels, query]);

  function handleToggle(label: string) {
    const isSelected = value.includes(label);
    onChange(isSelected ? value.filter((l) => l !== label) : [...value, label]);
  }

  return (
    <>
      <BasePicker.Trigger
        title={value.length > 0 ? `Labels: ${value.join(", ")}` : "No labels"}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 -mr-2 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{ transition: "background-color 0.15s ease" }}
      >
        {value.length > 0 ? (
          <span className="flex flex-wrap justify-end gap-1">
            {value.map((l) => <Tag key={l}>{l}</Tag>)}
          </span>
        ) : (
          <span className="text-xs text-text-muted">None</span>
        )}
      </BasePicker.Trigger>

      <BasePicker.Popover width="w-[240px]">
        <BasePicker.Search placeholder="Search labels..." />
        <BasePicker.List>
          {labels.length === 0 && !data && <BasePicker.Empty>Loading...</BasePicker.Empty>}
          {filtered.length === 0 && query.trim() && <BasePicker.Empty>No labels found</BasePicker.Empty>}
          {filtered.length === 0 && !query.trim() && data && <BasePicker.Empty>No labels available</BasePicker.Empty>}

          {filtered.map((label) => {
            const isSelected = value.includes(label);
            return (
              <BasePicker.Item
                key={label}
                selected={isSelected}
                onSelect={() => handleToggle(label)}
              >
                <span className={`flex-1 text-left ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                  {label}
                </span>
              </BasePicker.Item>
            );
          })}
        </BasePicker.List>
      </BasePicker.Popover>
    </>
  );
}
