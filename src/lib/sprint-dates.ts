/**
 * Sprint scheduling conventions.
 *
 * A sprint normally runs Friday through Thursday two weeks later, but
 * occasionally starts a little later (e.g. the following Tuesday). In both
 * cases the end day lands on the same Thursday: take the start date, add one
 * week, then snap to the first Thursday on or after that. The end time is
 * fixed at 17:00.
 */

const THURSDAY = 4; // Date.getDay(): 0 = Sunday ... 4 = Thursday

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse the picker value ("" | "YYYY-MM-DD" | "YYYY-MM-DDTHH:mm") to a local Date, or null. */
function parseDatePart(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Derive the conventional sprint end value from a start value.
 * Falls back to today when no start date is set yet.
 * Returns "YYYY-MM-DDT17:00".
 */
export function sprintEndFromStart(startValue: string): string {
  const base = parseDatePart(startValue) ?? new Date();
  base.setDate(base.getDate() + 7);
  const offsetToThursday = (THURSDAY - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + offsetToThursday);
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T17:00`;
}

/**
 * Whole-day span between a start and end picker value (date parts only, so the
 * end's 17:00 does not produce a fractional day). Returns null when either side
 * is missing/unparseable or the end precedes the start.
 */
export function sprintDurationDays(startValue: string, endValue: string): number | null {
  const start = parseDatePart(startValue);
  const end = parseDatePart(endValue);
  if (!start || !end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days < 0 ? null : days;
}

/** Convert a stored ISO timestamp to the picker value ("" | "YYYY-MM-DD" | "YYYY-MM-DDTHH:mm"). */
export function toInputDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    // A date stored at local midnight had no explicit time; keep it time-less so
    // it never resurfaces a phantom time on reopen.
    if (d.getHours() === 0 && d.getMinutes() === 0) return datePart;
    return `${datePart}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/** Convert a picker value to an ISO timestamp for storage. */
export function toIsoDateTime(input: string): string {
  if (!input) return "";
  // "YYYY-MM-DD" alone parses as UTC midnight, which renders as 02:00 in a
  // UTC+2 zone. Anchor a time-less date to local midnight instead.
  const normalized = input.includes("T") ? input : `${input}T00:00`;
  return new Date(normalized).toISOString();
}
