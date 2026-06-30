/**
 * Bounded-concurrency map: runs at most `limit` tasks at once, preserves input order.
 *
 * Used to parallelize I/O-bound fan-out (per-key Jira fetches, per-run pipeline
 * lookups) without overwhelming the upstream API. Results are returned in the same
 * order as `items`, so callers can safely zip them back against the input array.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, () => worker()),
  );
  return results;
}
