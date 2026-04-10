const SLOW_QUERY_THRESHOLD_MS = 100;

/**
 * Measures execution time of an async operation and logs a warning
 * if it exceeds the threshold. Returns both the result and duration.
 */
export async function timedQuery<T>(
  label: string,
  fn: () => T | Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);

  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    console.warn(`[slow-query] ${label}: ${durationMs}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);
  }

  return { result, durationMs };
}
