"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, ChevronDown, Loader2, Check, ArrowLeftRight, MapPin } from "lucide-react";
import { jira as jiraApi, settings as settingsApi } from "@/lib/api-client";
import type { Sprint } from "@/types/ticket";

// The placement the PO chooses when promoting a card. "__backlog__" mirrors the
// move-sprint backlog marker; "__default__" resolves to the configured default
// sprint at promotion time; any other value is a concrete sprint id.
export const BACKLOG_PLACEMENT = "__backlog__";
export const DEFAULT_PLACEMENT = "__default__";

interface SprintPlacementMenuProps {
  // Fired with the chosen placement. On a "create" menu this is the Create-in-
  // Jira placement (a sprint id, backlog, or "__default__"); on a "reassign"
  // menu it is the new sprint for a card already live in Jira; on a "setting"
  // menu it is the epic's new default placement (BRDG-500 #1).
  onCreate: (placement: string) => void | Promise<unknown>;
  // True while the action is in flight, so the trigger shows a busy state.
  busy?: boolean;
  disabled?: boolean;
  // "create" promotes a DRAFT card (offers the default-sprint option); "reassign"
  // moves an already-created card (no default-sprint option, marks the current
  // sprint); "setting" configures the epic's default child placement (marks the
  // current choice, offers a "choose each time" reset). Defaults to "create".
  variant?: "create" | "reassign" | "setting";
  // The card's current sprint id when reassigning, so the menu can mark it.
  currentSprintId?: string | null;
  // The epic's currently-configured placement (setting variant): marks the active
  // option and drives the trigger label. "__backlog__" / "__default__" / sprint id.
  selectedPlacement?: string | null;
  // Reset the setting to "not configured" (setting variant only). When provided
  // and a placement is set, the menu offers a "Choose each time" reset item.
  onClear?: () => void | Promise<unknown>;
  // Renders a bare chevron trigger instead of the full labelled button, for the
  // Create-in-Jira split button's one-off override (BRDG-500 #2). Uses the brand
  // create styling so it reads as the second segment of that split button.
  chevronOnly?: boolean;
}

/**
 * The Create-in-Jira trigger with a placement menu: a sprint, "to be planned"
 * (backlog), or the default sprint. Sprints are read from the existing cached
 * list and the default-sprint setting; an empty default means backlog, which is
 * surfaced as a hint on the default option. Choosing an option promotes the card
 * with that placement. In the "reassign" variant the same picker moves a card
 * that is already live in Jira to a different sprint (or the backlog).
 */
export function SprintPlacementMenu({
  onCreate,
  busy,
  disabled,
  variant = "create",
  currentSprintId,
  selectedPlacement,
  onClear,
  chevronOnly,
}: SprintPlacementMenuProps) {
  const isReassign = variant === "reassign";
  const isSetting = variant === "setting";
  const [open, setOpen] = useState(false);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [defaultSprintId, setDefaultSprintId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // The setting trigger names the configured sprint, so the list is needed even
  // before the menu opens when a concrete sprint id is selected.
  const needsSprintName =
    isSetting &&
    !!selectedPlacement &&
    selectedPlacement !== BACKLOG_PLACEMENT &&
    selectedPlacement !== DEFAULT_PLACEMENT;

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
  // The setting trigger also loads eagerly when it must resolve a sprint name.
  useEffect(() => {
    if ((!open && !needsSprintName) || loaded) return;
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
  }, [open, loaded, needsSprintName]);

  const choose = (placement: string) => {
    setOpen(false);
    void onCreate(placement);
  };

  const clearSetting = () => {
    setOpen(false);
    void onClear?.();
  };

  // Compact label for the setting trigger: names where new stories will land.
  const settingLabel = (): string => {
    if (selectedPlacement === BACKLOG_PLACEMENT) return "New in backlog";
    if (selectedPlacement === DEFAULT_PLACEMENT) return "New in default sprint";
    if (selectedPlacement) {
      const s = sprints.find((x) => x.id === selectedPlacement);
      return `New in ${s ? s.name : "sprint"}`;
    }
    return "Set placement";
  };

  return (
    <div ref={containerRef} className="relative">
      {chevronOnly ? (
        /* Bare chevron for the Create-in-Jira split button's one-off override
           (BRDG-500 #2): reads as the second segment of the brand split button. */
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Create with a different placement for this story"
          title="Create in a different sprint or the backlog (this story only)"
          className="flex h-full items-center justify-center border-l border-[var(--color-brand-400)]/40 px-1.5 text-[var(--color-brand-400)] cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-400)]/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronDown size={12} strokeWidth={2} />
        </button>
      ) : isSetting ? (
        /* Epic-level placement setting (BRDG-500 #1): a settings chip that names
           where new child stories will be created. Brand-tinted once configured. */
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Where new child stories are created in Jira"
          className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-label font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${
            selectedPlacement
              ? "border-[var(--color-brand-400)]/40 bg-[var(--color-brand-400)]/10 text-[var(--color-brand-400)] hover:bg-[var(--color-brand-400)]/20"
              : "border-border-subtle bg-overlay-subtle text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
          }`}
        >
          {busy ? (
            <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
          ) : (
            <MapPin size={11} strokeWidth={1.75} />
          )}
          <span className="max-w-[16ch] truncate">{settingLabel()}</span>
          <ChevronDown size={10} strokeWidth={2} />
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={
            isReassign
              ? "flex items-center gap-1 rounded-md border border-border-default bg-overlay-subtle px-2 py-0.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              : "flex items-center gap-1 rounded-md border border-[var(--color-brand-400)]/40 bg-[var(--color-brand-400)]/10 px-2 py-0.5 text-label font-medium text-[var(--color-brand-400)] cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-400)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          }
          title={isReassign ? "Move this story to a different sprint" : "Create this story in Jira under the epic"}
        >
          {busy ? (
            <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
          ) : isReassign ? (
            <ArrowLeftRight size={11} strokeWidth={1.75} />
          ) : (
            <CloudUpload size={11} strokeWidth={1.75} />
          )}
          {isReassign ? "Move sprint" : "Create in Jira"}
          <ChevronDown size={10} strokeWidth={2} />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border-default bg-surface-elevated py-1 shadow-popover"
        >
          {/* Reset the epic setting so each card chooses its placement again
              (setting variant only, once something is configured). */}
          {isSetting && onClear && selectedPlacement && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={clearSetting}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                Choose each time
                <span className="text-label text-text-muted">reset</span>
              </button>
              <div className="my-1 border-t border-border-subtle" />
            </>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => choose(BACKLOG_PLACEMENT)}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            To be planned
            {isSetting && selectedPlacement === BACKLOG_PLACEMENT ? (
              <Check size={11} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
            ) : (
              <span className="text-label text-text-muted">backlog</span>
            )}
          </button>

          {/* The default-sprint option only makes sense when promoting a new
              card or configuring the epic default; reassigning an existing card
              moves it to a concrete sprint. */}
          {!isReassign && (
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(DEFAULT_PLACEMENT)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              Default sprint
              {isSetting && selectedPlacement === DEFAULT_PLACEMENT ? (
                <Check size={11} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
              ) : !defaultSprintId && loaded ? (
                <span className="text-label text-text-muted">none set</span>
              ) : null}
            </button>
          )}

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
                {(isReassign
                  ? s.id === currentSprintId
                  : isSetting
                    ? s.id === selectedPlacement
                    : s.state === "active") && (
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
