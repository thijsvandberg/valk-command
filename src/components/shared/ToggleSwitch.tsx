"use client";

/**
 * Small on/off switch in the Bridge brand treatment. Extracted from the inline
 * auto-scan toggle on /cleanup so the cleanup auto control and the scan-control
 * toggles share one accessible switch (role="switch" + keyboard focus ring).
 * Animates transform/colour only, per the project's motion rules.
 */

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}

export function ToggleSwitch({ checked, onChange, disabled = false, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={[
        "relative flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/25"
          : "border-border-default bg-overlay-subtle",
      ].join(" ")}
    >
      <span
        className={[
          "absolute h-2.5 w-2.5 rounded-full transition-[transform,background-color] duration-150",
          checked ? "translate-x-[14px] bg-[var(--color-brand-400)]" : "translate-x-[1px] bg-text-muted",
        ].join(" ")}
      />
    </button>
  );
}
