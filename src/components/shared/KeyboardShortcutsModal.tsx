"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "./Modal";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-border-strong bg-overlay-subtle px-1.5 py-0.5 font-mono text-label font-medium text-text-secondary shadow-[0_1px_0_1px_var(--color-overlay-default)]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("valk:openKeyboardShortcuts", onOpen);
    return () => window.removeEventListener("valk:openKeyboardShortcuts", onOpen);
  }, []);

  return (
    <Modal open={open} onClose={handleClose} aria-label="Keyboard shortcuts">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-[var(--color-surface-elevated)] shadow-[var(--shadow-2xl)]">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
            Keyboard shortcuts
          </h2>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 pb-5">
          {KEYBOARD_SHORTCUTS.map((group, gi) => (
            <div key={group.scope} className={gi > 0 ? "mt-4" : ""}>
              <h3 className="mb-2 text-caption font-semibold uppercase tracking-wider text-text-muted">
                {group.scope}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.action}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5"
                  >
                    <span className="text-body-sm text-text-secondary">
                      {shortcut.action}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, ki) => (
                        <Kbd key={ki}>{key}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
