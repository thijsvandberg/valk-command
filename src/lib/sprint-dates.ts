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
