/**
 * Pure sort/filter helpers for the /cleanup view (BRDG-283). Kept apart from the
 * component so the ordering and threshold rules can be unit-tested without a DOM.
 * The API applies the same intent server-side; these run client-side too so the
 * already-loaded list re-orders instantly when controls change.
 */

import type { CleanupRow, CleanupSort, Disposition, ScannedFilter } from "@/lib/cleanup-types";
import { REVIVAL_CANDIDATE_THRESHOLD } from "@/lib/cleanup-types";

export interface CleanupFilters {
  scanned: ScannedFilter;
  disposition: Disposition | "all";
  minOverall: number;
  // When true, keep only revival candidates (revivalScore at/above the backend
  // promotion threshold). The opposite read from deprecation, surfaced as its own
  // filter so the PO can isolate "worth pulling up" tickets (BRDG-298).
  revivalOnly: boolean;
}

// A row is a revival candidate when its analyzer score crosses the same 0.6 bar
// the background runner uses to promote one. Centralised so the badge, filter,
// and sort all agree on what "candidate" means.
export function isRevivalCandidate(row: CleanupRow): boolean {
  return row.revivalScore != null && row.revivalScore >= REVIVAL_CANDIDATE_THRESHOLD;
}

// Null overall/lastScanned must always sink to the bottom regardless of sort
// direction: an unscored ticket has no score to rank by, so it should never
// outrank a real one. WHY a sentinel rather than dropping: never-scanned rows
// still belong on the screen (the PO needs to see what is pending).
function compareNullableDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

export function filterRows(rows: CleanupRow[], f: CleanupFilters): CleanupRow[] {
  return rows.filter((r) => {
    if (f.scanned === "scanned" && r.lastScannedAt == null) return false;
    if (f.scanned === "never" && r.lastScannedAt != null) return false;
    if (f.disposition !== "all" && r.disposition !== f.disposition) return false;
    if (f.minOverall > 0 && (r.scanOverall == null || r.scanOverall < f.minOverall)) return false;
    if (f.revivalOnly && !isRevivalCandidate(r)) return false;
    return true;
  });
}

export function sortRows(rows: CleanupRow[], sort: CleanupSort): CleanupRow[] {
  const copy = [...rows];
  switch (sort) {
    case "overall":
      copy.sort((a, b) => compareNullableDesc(a.scanOverall, b.scanOverall));
      break;
    case "revival":
      copy.sort((a, b) => compareNullableDesc(a.revivalScore, b.revivalScore));
      break;
    case "staleness":
      copy.sort((a, b) =>
        compareNullableDesc(a.topicScores.staleness ?? null, b.topicScores.staleness ?? null),
      );
      break;
    case "lastScanned-oldest":
      copy.sort((a, b) => {
        if (a.lastScannedAt == null && b.lastScannedAt == null) return 0;
        if (a.lastScannedAt == null) return 1;
        if (b.lastScannedAt == null) return -1;
        return a.lastScannedAt.localeCompare(b.lastScannedAt);
      });
      break;
    case "lastScanned-newest":
      copy.sort((a, b) => {
        if (a.lastScannedAt == null && b.lastScannedAt == null) return 0;
        if (a.lastScannedAt == null) return 1;
        if (b.lastScannedAt == null) return -1;
        return b.lastScannedAt.localeCompare(a.lastScannedAt);
      });
      break;
    case "key":
      copy.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
      break;
  }
  return copy;
}

/**
 * Map a 0..1 deprecation-likelihood score to the project's semantic heat ramp.
 * Low is calm brand teal, mid warns amber, high reads as error red ("this can
 * probably go"). Returns design tokens, never raw hex, per the UI rules.
 */
export function scoreHeat(score: number | null): { color: string; track: string } {
  if (score == null) return { color: "var(--color-status-neutral)", track: "var(--color-overlay-subtle)" };
  if (score >= 0.75) return { color: "var(--color-status-error)", track: "var(--color-status-error-subtle)" };
  if (score >= 0.6) return { color: "var(--color-status-warning)", track: "var(--color-status-warning-subtle)" };
  if (score >= 0.35) return { color: "var(--color-status-caution)", track: "var(--color-status-caution-subtle)" };
  return { color: "var(--color-brand-400)", track: "var(--color-brand-subtle)" };
}

/**
 * Revival is the OPPOSITE conclusion from deprecation, so it reads on the
 * positive/"success" green ramp rather than the deprecation heat ramp. A single
 * affirmative colour (no warning gradient) keeps the two signals visually
 * unmistakable: red-amber = "this can go", green = "pull this up".
 */
export function revivalHeat(score: number | null): { color: string; track: string } {
  if (score == null) return { color: "var(--color-status-neutral)", track: "var(--color-overlay-subtle)" };
  return { color: "var(--color-status-success)", track: "var(--color-status-success-subtle)" };
}
