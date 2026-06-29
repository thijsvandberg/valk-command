"use client";

import { useState, useEffect } from "react";
import { ChatInput } from "@/components/shared/ChatInput";

export interface InvestigationConfig {
  explainMode: boolean;
}

interface InvestigationInputProps {
  onSend: (content: string) => Promise<boolean>;
  onConfigChange: (config: InvestigationConfig) => void;
  disabled?: boolean;
  onCancel?: () => void;
}

function ModeToggle({ explainMode, onChange }: { explainMode: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center">
      <div className="flex items-center rounded-lg border border-border-strong bg-surface-floating p-0.5">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-md px-3 py-1 text-body-sm font-medium font-[var(--font-body)] cursor-pointer transition-colors duration-150 ${
            !explainMode
              ? "bg-[var(--color-brand-600)]/20 text-[var(--color-brand-400)] shadow-sm"
              : "text-text-tertiary hover:text-text-secondary"
          } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
        >
          Tech
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-md px-3 py-1 text-body-sm font-medium font-[var(--font-body)] cursor-pointer transition-colors duration-150 ${
            explainMode
              ? "bg-[var(--color-brand-600)]/20 text-[var(--color-brand-400)] shadow-sm"
              : "text-text-tertiary hover:text-text-secondary"
          } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
        >
          Explain
        </button>
      </div>
    </div>
  );
}

export default function InvestigationInput({
  onSend,
  onConfigChange,
  disabled,
  onCancel,
}: InvestigationInputProps) {
  const [explainMode, setExplainMode] = useState(false);

  useEffect(() => {
    onConfigChange({ explainMode });
  }, [explainMode, onConfigChange]);

  return (
    <ChatInput
      onSend={onSend}
      disabled={disabled}
      onCancel={onCancel}
      placeholder="Ask a question about the codebase... (include a Jira key like VPL-20661 for extra context)"
      ariaLabel="Investigation question"
      sendAriaLabel="Send investigation"
      testId="investigation-input"
      headerSlot={<ModeToggle explainMode={explainMode} onChange={setExplainMode} />}
    />
  );
}
