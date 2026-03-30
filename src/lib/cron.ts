// Validates a single cron field: *, */N, N, N-N, N/N, N-N/N, or comma-separated combinations
const CRON_FIELD_RE =
  /^(\*|\*\/\d+|\d+(-\d+)?(\/\d+)?)(\s*,(\*|\*\/\d+|\d+(-\d+)?(\/\d+)?))*$/;

// Validates a standard 5-field cron expression (minute hour day month weekday)
export function isValidCron(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  return fields.length === 5 && fields.every((f) => CRON_FIELD_RE.test(f));
}
