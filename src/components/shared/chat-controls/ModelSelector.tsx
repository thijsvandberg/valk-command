"use client";

import { Button } from "@/components/ui/Button";

export interface ModelOption {
  value: string;
  label: string;
}

export const DEFAULT_MODEL_OPTIONS: readonly ModelOption[] = [
  { value: "claude-sonnet-4-6", label: "Sonnet" },
  { value: "claude-opus-4-6", label: "Opus" },
] as const;

interface ModelSelectorProps {
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  options?: readonly ModelOption[];
}

/**
 * Compact model switcher rendered in a chat input footer. Cycles through the
 * available models on click rather than opening a dropdown, matching the
 * minimal footprint the chat footer needs.
 */
export function ModelSelector({
  model,
  onModelChange,
  disabled,
  options = DEFAULT_MODEL_OPTIONS,
}: ModelSelectorProps) {
  const current = options.find((o) => o.value === model);
  return (
    <Button
      variant="ghost"
      size="md"
      onClick={() => {
        const idx = options.findIndex((o) => o.value === model);
        const next = (idx + 1) % options.length;
        onModelChange(options[next].value);
      }}
      disabled={disabled}
      className="border-border-strong bg-overlay-subtle font-mono text-caption tracking-[0.04em] text-text-secondary hover:text-text-secondary hover:border-border-strong hover:bg-overlay-default"
      title="Switch model"
      aria-label="Switch model"
    >
      {current?.label ?? options[0]?.label ?? "Sonnet"}
    </Button>
  );
}
