"use client";

import { Code2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface CodebaseToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

/**
 * Toggles codebase research for the agent. When on, the request asks the
 * workspace to inspect the actual repository before answering.
 */
export function CodebaseToggle({ enabled, onChange, disabled }: CodebaseToggleProps) {
  return (
    <Button
      variant={enabled ? "soft" : "ghost"}
      size="md"
      icon={<Code2 size={11} strokeWidth={1.5} />}
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      title={enabled ? "Codebase research on" : "Codebase research off"}
      aria-label={enabled ? "Codebase research on" : "Codebase research off"}
      aria-pressed={enabled}
      className={`text-caption ${
        enabled
          ? ""
          : "border-border-strong bg-overlay-subtle text-text-tertiary hover:text-text-secondary hover:border-border-strong hover:bg-overlay-default"
      }`}
    >
      Codebase
    </Button>
  );
}
