"use client";

import { useState, useCallback, useEffect } from "react";
import { getSpColor } from "@/types/ticket";
import { Hash } from "lucide-react";

const FIBONACCI = [1, 2, 3, 5, 8] as const;

export function SessionStoryPointPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const handleSelect = useCallback(
    (n: number) => {
      if (n === value) {
        onChange(null);
      } else {
        onChange(n);
      }
      setExpanded(false);
    },
    [value, onChange],
  );

  const handleCustomSubmit = useCallback(() => {
    const parsed = parseInt(customInput, 10);
    if (parsed > 0 && parsed <= 999) {
      onChange(parsed);
    }
    setCustomMode(false);
    setCustomInput("");
    setExpanded(false);
  }, [customInput, onChange]);

  useEffect(() => {
    if (!expanded) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setExpanded(false);
        setCustomMode(false);
        setCustomInput("");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  const displayValue = value != null ? (value === 0 ? "N/A" : String(value)) : null;
  const color = value != null ? getSpColor(value) : null;

  return (
    <div>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border-default px-4 py-3 hover:border-[var(--color-brand-500)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{
            transition: "border-color 0.15s ease",
            backgroundColor: color?.bg ?? "var(--color-overlay-subtle)",
          }}
        >
          <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Story Points</span>
          <span
            className="text-lg font-semibold tabular-nums"
            style={{ color: color?.text ?? "var(--color-text-muted)" }}
          >
            {displayValue ?? "Not estimated"}
          </span>
        </button>
      ) : (
        <div className="rounded-xl border border-[var(--color-brand-500)]/20 bg-[var(--color-surface-floating)] p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">Estimate</div>
          {customMode ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="number"
                min="1"
                max="999"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleCustomSubmit(); }
                  if (e.key === "Escape") { e.preventDefault(); setCustomMode(false); setCustomInput(""); }
                }}
                placeholder="SP"
                className="h-12 w-20 rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 text-center text-lg font-medium tabular-nums text-text-primary outline-none focus:border-[var(--color-brand-400)]"
              />
              <button
                type="button"
                onClick={handleCustomSubmit}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg bg-overlay-default text-text-muted hover:bg-overlay-strong hover:text-text-secondary active:opacity-60"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              >
                <Hash size={16} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {FIBONACCI.map((n) => {
                const c = getSpColor(n);
                const isActive = n === value;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleSelect(n)}
                    className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg text-base font-semibold tabular-nums hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
                    style={{
                      color: isActive ? "#fff" : c.text,
                      backgroundColor: isActive ? c.text : c.bg,
                      boxShadow: isActive ? `0 0 0 2px ${c.text}40, 0 2px 8px ${c.text}30` : undefined,
                      transition: "transform 0.1s ease, opacity 0.15s ease",
                    }}
                  >
                    {n}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                title="Custom value"
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg bg-overlay-default text-text-muted hover:bg-overlay-strong hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
              >
                <Hash size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
