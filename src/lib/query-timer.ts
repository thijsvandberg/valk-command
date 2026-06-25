import { logger } from "@/lib/logger";

// Threshold above which a query is logged as slow. Env-overridable so a noisy
// environment can be tuned without a code change (default 100ms). Read once at
// module init; mirrors the logger's level handling.
function resolveThreshold(): number {
  const raw = process.env.QUERY_SLOW_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

export const SLOW_QUERY_THRESHOLD_MS = resolveThreshold();

const MAX_STATS_ENTRIES = 200;

// Cap the recorded SQL identity so a pathological query (e.g. a giant IN-list)
// cannot bloat the in-memory map or a log line. The text is the PARAMETERIZED
// SQL (with `?` placeholders) only; bound values are never part of it.
const MAX_SQL_LABEL_LEN = 200;

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
 * Collapses a prepared statement's SQL text into a stable, log-safe identity:
 * whitespace runs become single spaces and the result is truncated. Operates on
 * the parameterized SQL (`?` placeholders), so it can never carry bound values;
 * callers must pass `statement.source`, NEVER an interpolated query.
 */
export function normalizeSqlLabel(sql: string): string {
  const collapsed = sql.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_SQL_LABEL_LEN
    ? `${collapsed.slice(0, MAX_SQL_LABEL_LEN)}...`
    : collapsed;
}

/**
 * Records one query timing under `label` and logs a `[slow-query]` warn when it
 * exceeds the threshold. The label is the query identity that makes a slow line
 * traceable, so it must be parameterized SQL or a route name, never a value.
 * Synchronous and allocation-light because it runs on the hot DB path.
 */
export function recordQuery(label: string, durationMs: number): void {
  const isSlow = durationMs > SLOW_QUERY_THRESHOLD_MS;
  if (isSlow) {
    logger.warn(
      "slow-query",
      `${label}: ${durationMs}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`,
    );
  }

  const existing = stats.get(label);
  if (existing) {
    existing.count++;
    existing.totalMs += durationMs;
    existing.maxMs = Math.max(existing.maxMs, durationMs);
    if (isSlow) existing.slowCount++;
    existing.lastAt = new Date().toISOString();
  } else {
    if (stats.size >= MAX_STATS_ENTRIES) {
      const oldest = [...stats.entries()].sort((a, b) =>
        a[1].lastAt.localeCompare(b[1].lastAt),
      )[0];
      if (oldest) stats.delete(oldest[0]);
    }
    stats.set(label, {
      label,
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
      slowCount: isSlow ? 1 : 0,
      lastAt: new Date().toISOString(),
    });
  }
}

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

  recordQuery(label, durationMs);

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
