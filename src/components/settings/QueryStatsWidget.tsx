"use client";

import { RefreshCw, Database } from "lucide-react";
import useSWR from "swr";

// Diagnostics widget (BRDG-404): surfaces the in-memory slow-query aggregates
// from GET /api/dev/query-stats. The endpoint is dev-gated and returns 404 in
// production, so the widget renders an "unavailable" note there rather than
// failing loudly.

interface QueryStatRow {
  label: string;
  count: number;
  avgMs: number;
  maxMs: number;
  slowCount: number;
  lastAt: string;
}

interface QueryStatsResponse {
  thresholdMs: number;
  queries: QueryStatRow[];
}

const MAX_ROWS = 10;

const fetcher = async (url: string): Promise<QueryStatsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`query-stats unavailable (${res.status})`);
  return res.json();
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export function QueryStatsWidget() {
  const { data, error, isLoading, mutate } = useSWR<QueryStatsResponse>(
    "/api/dev/query-stats",
    fetcher,
    { revalidateOnFocus: false },
  );

  // Slowest first by worst observed duration; that is the query worth chasing.
  const rows = [...(data?.queries ?? [])]
    .sort((a, b) => b.maxMs - a.maxMs)
    .slice(0, MAX_ROWS);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={14} strokeWidth={1.5} className="text-text-tertiary" />
          <h3 className="text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">
            Slow queries
          </h3>
          {data && (
            <span className="text-label text-text-muted">
              threshold {data.thresholdMs}ms
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          disabled={isLoading}
          aria-label="Refresh query stats"
          className="flex items-center gap-1.5 rounded-lg border border-border-strong bg-overlay-subtle px-2.5 py-1 text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30"
          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        >
          <RefreshCw
            size={12}
            strokeWidth={1.5}
            className={isLoading ? "animate-spin" : undefined}
          />
          Refresh
        </button>
      </div>

      <p className="mb-3 text-body-sm leading-relaxed text-text-tertiary">
        Aggregated from the central DB layer. SQL is parameterized (no values).
        In-memory only, so counts reset on restart.
      </p>

      {error ? (
        <div className="rounded-lg border border-border-subtle bg-overlay-subtle px-4 py-3">
          <p className="text-body-sm text-text-muted">
            Query stats are only available in development.
          </p>
        </div>
      ) : isLoading && !data ? (
        <div className="rounded-lg border border-border-subtle bg-overlay-subtle px-4 py-3">
          <p className="text-body-sm text-text-tertiary">Loading...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-overlay-subtle px-4 py-3">
          <p className="text-body-sm text-text-muted">No queries recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-default bg-overlay-subtle">
          <div className="flex flex-col divide-y divide-border-subtle">
            {rows.map((row) => (
              <div key={row.label} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <code className="min-w-0 flex-1 truncate font-mono text-label text-text-secondary" title={row.label}>
                    {row.label}
                  </code>
                  <span
                    className="shrink-0 font-mono text-body-sm tabular-nums"
                    style={{
                      color:
                        row.slowCount > 0
                          ? "var(--color-status-warning)"
                          : "var(--color-text-tertiary)",
                    }}
                  >
                    {row.maxMs}ms max
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-label text-text-muted">
                  <span className="tabular-nums">avg {row.avgMs}ms</span>
                  <span className="tabular-nums">{row.count}&times;</span>
                  {row.slowCount > 0 && (
                    <span className="tabular-nums" style={{ color: "var(--color-status-warning)" }}>
                      {row.slowCount} slow
                    </span>
                  )}
                  {row.lastAt && <span>{formatRelative(row.lastAt)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
