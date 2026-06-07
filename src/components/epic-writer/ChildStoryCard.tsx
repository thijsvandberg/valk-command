"use client";

import { Layers, FileText, AlignLeft } from "lucide-react";
import type { EpicChildDraftRow } from "@/db/schema";

interface ChildStoryCardProps {
  card: EpicChildDraftRow;
}

/**
 * Depth of a card drives the badge: title-only (skeleton), bullets (the default
 * detail level), or full (a worked-out body added in the detail phase). The
 * badge tells the PO at a glance how far a story has been taken.
 */
type Depth = "title" | "bullets" | "full";

function cardDepth(card: EpicChildDraftRow): Depth {
  if (card.body && card.body.trim().length > 0) return "full";
  if (Array.isArray(card.bullets) && card.bullets.length > 0) return "bullets";
  return "title";
}

const DEPTH_META: Record<Depth, { label: string; icon: typeof Layers }> = {
  title: { label: "Title", icon: FileText },
  bullets: { label: "Bullets", icon: AlignLeft },
  full: { label: "Full", icon: Layers },
};

/**
 * A single child-story card on the breakdown board. Renders the title, bullet
 * list, and a depth badge. DRAFT cards show the local state; created cards show
 * their Jira key. Create-in-Jira and link affordances arrive in later stories.
 */
export function ChildStoryCard({ card }: ChildStoryCardProps) {
  const depth = cardDepth(card);
  const meta = DEPTH_META[depth];
  const DepthIcon = meta.icon;
  const bullets = Array.isArray(card.bullets) ? card.bullets : [];

  return (
    <article className="rounded-lg border border-border-subtle bg-surface-elevated/60 p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-text-muted">
            {card.cardIndex + 1}
          </span>
          <h3 className="min-w-0 truncate text-body-sm font-semibold text-text-primary">
            {card.title}
          </h3>
        </div>
        <span
          className="flex shrink-0 items-center gap-1 rounded-md bg-overlay-default px-1.5 py-0.5 text-label font-medium text-text-tertiary"
          title={`Depth: ${meta.label}`}
        >
          <DepthIcon size={10} strokeWidth={1.75} />
          {meta.label}
        </span>
      </header>

      {bullets.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-1.5 text-body-sm leading-[1.6] text-text-secondary">
              <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-text-muted" />
              <span className="min-w-0">{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-3 flex items-center gap-2">
        {card.status === "created" && card.jiraKey ? (
          <span className="font-mono text-[10px] text-[var(--color-brand-400)]">
            {card.jiraKey}
          </span>
        ) : (
          <span className="rounded bg-overlay-subtle px-1.5 py-0.5 text-label font-medium uppercase tracking-wide text-text-muted">
            Draft
          </span>
        )}
      </footer>
    </article>
  );
}
