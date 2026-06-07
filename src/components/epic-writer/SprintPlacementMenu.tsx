"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, ChevronDown, Loader2, Check } from "lucide-react";
import { jira as jiraApi, settings as settingsApi } from "@/lib/api-client";
import type { Sprint } from "@/types/ticket";

// The placement the PO chooses when promoting a card. "__backlog__" mirrors the
// move-sprint backlog marker; "__default__" resolves to the configured default
// sprint at promotion time; any other value is a concrete sprint id.
export const BACKLOG_PLACEMENT = "__backlog__";
export const DEFAULT_PLACEMENT = "__default__";

interface SprintPlacementMenuProps {
  // Fired with the chosen placement when the PO confirms Create-in-Jira. The
  // sprint move itself is wired in a later story; this menu owns the choice.
  onCreate: (placement: string) => void | Promise<unknown>;
  // True while the promotion is in flight, so the trigger shows a busy state.
  busy?: boolean;
  disabled?: boolean;
}

/**
 * The Create-in-Jira trigger with a placement menu: a sprint, "to be planned"
 * (backlog), or the default sprint. Sprints are read from the existing cached
 * list and the default-sprint setting; an empty default means backlog, which is
 * surfaced as a hint on the default option. Choosing an option promotes the card
 * with that placement.
 */
export function SprintPlacementMenu({ onCreate, busy, disabled }: SprintPlacementMenuProps) {
  const [open, setOpen] = useState(false);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [defaultSprintId, setDefaultSprintId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click so the menu behaves like a normal dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Lazy-load options the first time the menu opens to keep the board cheap.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const [sprintList, def] = await Promise.all([
          jiraApi.getSprints(),
          settingsApi.getDefaultSprint().catch(() => ({ sprintId: "" })),
        ]);
        if (cancelled) return;
        setSprints(sprintList.filter((s) => s.state === "active" || s.state === "future"));
        setDefaultSprintId(def?.sprintId ?? "");
      } catch {
        /* options stay empty; backlog is always available */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  const choose = (placement: string) => {
    setOpen(false);
    void onCreate(placement);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md border border-[var(--color-brand-400)]/40 bg-[var(--color-brand-400)]/10 px-2 py-0.5 text-label font-medium text-[var(--color-brand-400)] cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-400)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        title="Create this story in Jira under the epic"
      >
        {busy ? (
          <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <CloudUpload size={11} strokeWidth={1.75} />
        )}
        Create in Jira
        <ChevronDown size={10} strokeWidth={2} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border-default bg-surface-elevated py-1 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(BACKLOG_PLACEMENT)}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            To be planned
            <span className="text-label text-text-muted">backlog</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => choose(DEFAULT_PLACEMENT)}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            Default sprint
            {!defaultSprintId && loaded && (
              <span className="text-label text-text-muted">none set</span>
            )}
          </button>

          {(sprints.length > 0 || !loaded) && (
            <div className="my-1 border-t border-border-subtle" />
          )}

          {!loaded ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-label text-text-muted">
              <Loader2 size={11} className="animate-spin" />
              Loading sprints…
            </div>
          ) : (
            sprints.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                onClick={() => choose(s.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <span className="min-w-0 truncate">{s.name}</span>
                {s.state === "active" && (
                  <Check size={11} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
