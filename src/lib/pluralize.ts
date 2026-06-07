// Picks the singular or plural noun for a count so labels read "1 item" / "2 items"
// rather than the grammatically wrong "1 items". Returns only the noun, not the
// count, so callers keep control over number formatting and surrounding markup.
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
