import type { ActivityLog } from "@/db/schema";
import type {
  ActivityLogDayStats,
  ActivityLogStats,
  ActivityLogTimelineEntry,
  HealthScore,
  RecurringFailure,
} from "@/types/ticket";

// Strip variable tokens from error detail to normalize for grouping.
// Removes Jira-style ticket keys, ISO timestamps, UUIDs, and plain integers.
export function normalizeErrorDetail(detail: string): string {
  return detail
    .replace(/[A-Z]+-\d+/g, "<KEY>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<TS>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<ID>")
    .replace(/(?<!\d)\d{5,}(?!\d)/g, "<NUM>")
    .trim();
}

export function computeDayStats(
  rows: ActivityLog[],
  failedAndUnacked: ActivityLog[],
): ActivityLogDayStats {
  const totalEvents = rows.length;
  const activeErrorCount = failedAndUnacked.length;
  if (totalEvents === 0) {
    return { totalEvents: 0, successRate: 100, avgDurationMs: 0, activeErrorCount };
  }

  const successCount = rows.filter((r) => r.status === "success").length;
  const successRate = Math.round((successCount / totalEvents) * 100);

  const withDuration = rows.filter((r) => r.durationMs !== null && r.durationMs > 0);
  const avgDurationMs =
    withDuration.length > 0
      ? Math.round(withDuration.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / withDuration.length)
      : 0;

  return {
    totalEvents,
    successRate,
    avgDurationMs,
    activeErrorCount,
  };
}

export function computeRecurringFailures(rows: ActivityLog[]): RecurringFailure[] {
  const groups = new Map<string, ActivityLog[]>();

  for (const row of rows) {
    if (row.status !== "failed") continue;
    const normalized = row.errorDetail ? normalizeErrorDetail(row.errorDetail) : "(no detail)";
    const key = `${row.type}::${normalized}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const result: RecurringFailure[] = [];

  for (const [key, entries] of groups) {
    if (entries.length < 3) continue;

    // Sort descending so index 0 is the most recent
    entries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const pattern = key.split("::").slice(1).join("::");
    const type = entries[0].type;
    const lastOccurrence = entries[0].startedAt;
    const mostRecentEntryId = entries[0].id;

    const affectedScopes = [
      ...new Set(entries.map((e) => e.scope).filter((s): s is string => !!s && s !== "0")),
    ];

    result.push({
      pattern,
      type,
      count: entries.length,
      lastOccurrence,
      affectedScopes,
      mostRecentEntryId,
    });
  }

  // Most frequent first
  result.sort((a, b) => b.count - a.count);

  return result;
}

export function computeTimeline(rows: ActivityLog[]): ActivityLogTimelineEntry[] {
  return rows
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      status: r.status,
      type: r.type,
      scope: r.scope ?? null,
      durationMs: r.durationMs ?? null,
    }));
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computeHealthScoreForRows(rows: ActivityLog[], failedRows: ActivityLog[], windowMs: number): number {
  const now = Date.now();

  // 1. Success rate component (0-100)
  const total = rows.length;
  const successRateScore = total === 0 ? 100 : (rows.filter((r) => r.status === "success").length / total) * 100;

  // 2. Duration consistency (0-100): per-type, ratio within 2x median
  const byType = new Map<string, number[]>();
  for (const row of rows) {
    if (row.durationMs === null || row.durationMs <= 0) continue;
    const list = byType.get(row.type) ?? [];
    list.push(row.durationMs);
    byType.set(row.type, list);
  }

  let withinThreshold = 0;
  let totalWithDuration = 0;
  for (const [, durations] of byType) {
    const median = computeMedian(durations);
    for (const d of durations) {
      totalWithDuration++;
      if (median === 0 || d <= 2 * median) withinThreshold++;
    }
  }
  const durationConsistencyScore = totalWithDuration === 0 ? 100 : (withinThreshold / totalWithDuration) * 100;

  // 3. Error-free streak (0-100): hours since last failed entry, normalized over 72h
  const lastFailed = failedRows.reduce((latest: string | null, r) => {
    if (!latest || r.startedAt > latest) return r.startedAt;
    return latest;
  }, null);

  let errorFreeStreakScore: number;
  if (!lastFailed) {
    errorFreeStreakScore = 100;
  } else {
    const msSinceLastFailed = now - new Date(lastFailed).getTime();
    const hoursSince = msSinceLastFailed / (1000 * 60 * 60);
    errorFreeStreakScore = Math.min(hoursSince, 72) / 72 * 100;
  }

  return successRateScore * 0.5 + durationConsistencyScore * 0.25 + errorFreeStreakScore * 0.25;
}

export function computeHealthScore(
  recentRows: ActivityLog[],
  recentFailedRows: ActivityLog[],
  sevenDaysAgoRows: ActivityLog[],
  sevenDaysAgoFailedRows: ActivityLog[],
): HealthScore {
  const WINDOW_MS = 72 * 60 * 60 * 1000;
  const currentScore = computeHealthScoreForRows(recentRows, recentFailedRows, WINDOW_MS);
  const pastScore = computeHealthScoreForRows(sevenDaysAgoRows, sevenDaysAgoFailedRows, WINDOW_MS);

  const roundedScore = Math.round(currentScore);
  const band: HealthScore["band"] =
    roundedScore >= 80 ? "green" : roundedScore >= 50 ? "amber" : "red";

  const diff = currentScore - pastScore;
  const trend: HealthScore["trend"] = diff > 3 ? "up" : diff < -3 ? "down" : "flat";

  const total = recentRows.length;
  const successRateComponent = total === 0 ? 100 : Math.round((recentRows.filter((r) => r.status === "success").length / total) * 100);

  // Re-derive duration consistency component value
  const byType = new Map<string, number[]>();
  for (const row of recentRows) {
    if (row.durationMs === null || row.durationMs <= 0) continue;
    const list = byType.get(row.type) ?? [];
    list.push(row.durationMs);
    byType.set(row.type, list);
  }
  let withinThreshold = 0;
  let totalWithDuration = 0;
  for (const [, durations] of byType) {
    const median = computeMedian(durations);
    for (const d of durations) {
      totalWithDuration++;
      if (median === 0 || d <= 2 * median) withinThreshold++;
    }
  }
  const durationConsistencyComponent = totalWithDuration === 0 ? 100 : Math.round((withinThreshold / totalWithDuration) * 100);

  const lastFailed = recentFailedRows.reduce((latest: string | null, r) => {
    if (!latest || r.startedAt > latest) return r.startedAt;
    return latest;
  }, null);
  let errorFreeStreakComponent: number;
  if (!lastFailed) {
    errorFreeStreakComponent = 100;
  } else {
    const hoursSince = (Date.now() - new Date(lastFailed).getTime()) / (1000 * 60 * 60);
    errorFreeStreakComponent = Math.round(Math.min(hoursSince, 72) / 72 * 100);
  }

  return {
    score: roundedScore,
    band,
    trend,
    components: {
      successRate: successRateComponent,
      durationConsistency: durationConsistencyComponent,
      errorFreeStreak: errorFreeStreakComponent,
    },
  };
}

export function computeStats(
  todayRows: ActivityLog[],
  yesterdayRows: ActivityLog[],
  sevenDayFailedRows: ActivityLog[],
  timelineRows: ActivityLog[],
  recentRows: ActivityLog[],
  sevenDaysAgoRows: ActivityLog[],
): ActivityLogStats {
  const todayFailed = todayRows.filter((r) => r.status === "failed" && !r.acknowledged);
  const yesterdayFailed = yesterdayRows.filter((r) => r.status === "failed" && !r.acknowledged);

  const today = computeDayStats(todayRows, todayFailed);
  const yesterday = computeDayStats(yesterdayRows, yesterdayFailed);
  const recurringFailures = computeRecurringFailures(sevenDayFailedRows);
  const timeline = computeTimeline(timelineRows);

  // For health score, use last 24h rows (recentRows) and last 24h of 7 days ago (sevenDaysAgoRows)
  const recentFailed = recentRows.filter((r) => r.status === "failed");
  const sevenDaysAgoFailed = sevenDaysAgoRows.filter((r) => r.status === "failed");
  const healthScore = computeHealthScore(recentRows, recentFailed, sevenDaysAgoRows, sevenDaysAgoFailed);

  return { today, yesterday, recurringFailures, timeline, healthScore };
}
