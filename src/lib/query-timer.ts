import { logger } from "@/lib/logger";

const SLOW_QUERY_THRESHOLD_MS = 100;
const MAX_STATS_ENTRIES = 200;

interface QueryStat {
  label: string;
  count: number;
  totalMs: number;
  maxMs: number;
  slowCount: number;
  lastAt: string;
}

const stats = new Map<string, QueryStat>();

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
    logger.warn("slow-query", `${label}: ${durationMs}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);
  }

  const existing = stats.get(label);
  if (existing) {
    existing.count++;
    existing.totalMs += durationMs;
    existing.maxMs = Math.max(existing.maxMs, durationMs);
    if (durationMs > SLOW_QUERY_THRESHOLD_MS) existing.slowCount++;
    existing.lastAt = new Date().toISOString();
  } else {
    if (stats.size >= MAX_STATS_ENTRIES) {
      const oldest = [...stats.entries()].sort((a, b) => a[1].lastAt.localeCompare(b[1].lastAt))[0];
      if (oldest) stats.delete(oldest[0]);
    }
    stats.set(label, {
      label,
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
      slowCount: durationMs > SLOW_QUERY_THRESHOLD_MS ? 1 : 0,
      lastAt: new Date().toISOString(),
    });
  }

  return { result, durationMs };
}

export function getQueryStats() {
  return [...stats.values()].map((s) => ({
    ...s,
    avgMs: Math.round(s.totalMs / s.count),
  }));
}

export function resetQueryStats() {
  stats.clear();
}
