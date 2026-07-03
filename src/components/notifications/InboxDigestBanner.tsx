"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Inbox, ArrowRight, AlarmClock } from "lucide-react";
import { inboxDigest, swrFetcher, type InboxDigestResponse } from "@/lib/api-client";

// Mirrors useInboxGroupBy's session key so "Open inbox" lands in Relevance
// grouping regardless of a previously persisted choice (BRDG-413 AC).
const GROUP_BY_KEY = "inbox-group-by";

/**
 * Persistent, server-backed inbox digest banner (BRDG-413). Polls
 * GET /api/inbox/digest (which lazily evaluates the twice-daily weekday windows)
 * and renders a card when a digest is active. Survives reloads because the
 * active state lives on the server; the client can dismiss or snooze (BRDG-462).
 */
export function InboxDigestBanner() {
  const router = useRouter();
  const { data, mutate } = useSWR<InboxDigestResponse>(inboxDigest.url(), swrFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });

  const active = data?.active ?? null;

  // Optimistically hide, then clear on the server (next poll reconciles if the
  // request fails). Both Open inbox and Dismiss clear the active digest.
  const clear = useCallback(async () => {
    await mutate({ active: null }, { revalidate: false });
    try {
      await inboxDigest.dismiss();
    } catch {
      // Best-effort; the 60s poll will resurface it if the dismiss didn't land.
    }
  }, [mutate]);

  // Snooze hides the banner for an hour (server-backed), then it resurfaces on a
  // later poll. Optimistically hide so the click feels instant.
  const snooze = useCallback(async () => {
    await mutate({ active: null }, { revalidate: false });
    try {
      await inboxDigest.snooze();
    } catch {
      // Best-effort; the 60s poll will resurface it if the snooze didn't land.
    }
  }, [mutate]);

  const handleOpen = useCallback(() => {
    try {
      sessionStorage.setItem(GROUP_BY_KEY, JSON.stringify("relevance"));
    } catch {
      // Storage unavailable; the inbox default is relevance anyway (Phase 4).
    }
    void clear();
    // Deep-link to the new-only view so the inbox lands pre-filtered to exactly
    // the digest's new items (shared read-based baseline, BRDG-438).
    router.push("/inbox?new=1");
  }, [clear, router]);

  if (!active) return null;

  const ticketWord = active.total === 1 ? "ticket" : "tickets";

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="New inbox tickets"
      className="pointer-events-auto fixed bottom-6 left-6 z-40 w-[340px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border-default bg-surface-floating"
      style={{ animation: "fadeInUp 0.24s ease-out", boxShadow: "var(--shadow-xl)" }}
    >
      {/* Brand hairline accent: a thin teal-to-transparent strip pinned to the top
          edge, giving the card a designed identity rather than a flat surface. */}
      <div
        aria-hidden
        className="h-[2px] w-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-brand-400), color-mix(in srgb, var(--color-brand-400) 25%, transparent) 60%, transparent)",
        }}
      />

      <div className="flex items-start gap-3 px-4 pt-4">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--color-brand-subtle)", boxShadow: "var(--shadow-sm)" }}
        >
          <Inbox size={17} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-[var(--font-display)] text-body-lg font-semibold leading-tight tracking-[-0.01em] text-text-primary">
            {active.total} new {ticketWord} in your inbox
          </h2>
          <p className="mt-0.5 text-label text-text-tertiary">Since you last reviewed your inbox</p>
        </div>

        <button
          type="button"
          onClick={() => void snooze()}
          aria-label="Snooze for 1 hour"
          title="Snooze for 1 hour"
          className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <AlarmClock size={16} strokeWidth={2} />
        </button>
      </div>

      {active.buckets.length > 0 && (
        <ul className="mt-3 space-y-0.5 px-4">
          {active.buckets.map((bucket) => (
            <li
              key={bucket.key}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-body-sm text-text-secondary">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-400)]"
                />
                <span className="truncate">{bucket.label}</span>
              </span>
              <span className="shrink-0 rounded-md bg-overlay-subtle px-1.5 py-0.5 text-label font-medium tabular-nums text-text-secondary">
                {bucket.count}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand-500)] px-3 py-1.5 text-body-sm font-medium text-white cursor-pointer transition-[background-color,transform] duration-150 hover:bg-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
        >
          Open inbox
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          className="rounded-lg px-3 py-1.5 text-body-sm font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
