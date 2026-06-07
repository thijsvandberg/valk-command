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
 * Suggested start date for the next sprint: the day after the previous sprint's
 * end. A sprint runs Friday through Thursday, so the previous end (a Thursday)
 * plus one day is the new Friday. Returns the time-less picker value
 * ("YYYY-MM-DD") anchored to local midnight, or "" when no usable end date.
 */
export function startDateFromPreviousEnd(endIso: string | null | undefined): string {
  if (!endIso) return "";
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return "";
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
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
