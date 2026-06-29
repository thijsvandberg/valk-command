/**
 * Shared relative date formatting.
 * Returns human-readable relative time like "2h ago", "3d ago", etc.
 * Use `title` attribute with `formatAbsoluteDate()` for full date on hover.
 */
export function relativeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Two-letter weekday codes (Mo, Tu, ...). Intl only offers 3-letter ("short") or an
// ambiguous 1-letter ("narrow"), so the compact form is mapped by getDay() (0 = Sunday).
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function formatAbsoluteDate(
  iso: string | null | undefined,
  opts?: { weekday?: boolean },
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const base = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return opts?.weekday ? `${WEEKDAY_SHORT[d.getDay()]} ${base}` : base;
}
