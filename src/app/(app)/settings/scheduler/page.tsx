"use client";

import { useState, useEffect, useCallback } from "react";
import { scheduler } from "@/lib/api-client";
import { Clock, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Play } from "lucide-react";

interface TaskStatus {
  name: string;
  label: string;
  description: string;
  intervalMs: number;
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: Record<string, unknown> | null;
}

function formatInterval(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds >= 86400) {
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  if (totalSeconds >= 3600) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (totalSeconds >= 60) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${totalSeconds}s`;
}

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatResult(task: TaskStatus): { text: string; isError: boolean } | null {
  const r = task.lastResult;
  if (!r) return null;

  if ("error" in r) {
    return { text: String(r.error), isError: true };
  }

  if ("skipped" in r && r.skipped) {
    const reason = r.reason ?? r.needsFullSync ? "Needs full sync first" : "Skipped";
    return { text: String(reason), isError: false };
  }

  // Incremental sync result
  if ("count" in r && typeof r.count === "number") {
    if (r.count === 0) {
      return { text: "All tickets up to date", isError: false };
    }
    const parts = [`${r.count} ticket${r.count === 1 ? "" : "s"} synced`];
    if (typeof r.remaining === "number" && r.remaining > 0) {
      parts.push(`${r.remaining} remaining`);
    }
    return { text: parts.join(", "), isError: false };
  }

  // Cleanup result
  if ("deleted" in r && typeof r.deleted === "number") {
    if (r.deleted === 0) {
      return { text: "No tickets to clean up", isError: false };
    }
    return { text: `${r.deleted} ticket${r.deleted === 1 ? "" : "s"} removed`, isError: false };
  }

  // Pipeline sync result
  if ("newRuns" in r && typeof r.newRuns === "number") {
    if (r.newRuns === 0 && r.updatedRuns === 0) {
      return { text: "All pipelines up to date", isError: false };
    }
    const parts: string[] = [];
    if (typeof r.newRuns === "number" && r.newRuns > 0) parts.push(`${r.newRuns} new`);
    if (typeof r.updatedRuns === "number" && (r.updatedRuns as number) > 0) parts.push(`${r.updatedRuns} updated`);
    return { text: parts.join(", "), isError: false };
  }

  return null;
}

export default function SchedulerPage() {
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const fetchTasks = useCallback(() => {
    (scheduler.status() as Promise<{ tasks: TaskStatus[] }>)
      .then((data) => {
        setTasks(data.tasks ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTasks();
    const id = setInterval(fetchTasks, 10_000);
    return () => clearInterval(id);
  }, [fetchTasks]);

  const handleRunNow = useCallback(async (name: string) => {
    setRunning((prev) => ({ ...prev, [name]: true }));
    try {
      await scheduler.run(name);
      await fetchTasks();
    } finally {
      setRunning((prev) => ({ ...prev, [name]: false }));
    }
  }, [fetchTasks]);

  return (
    <>
      <h2 className="text-xs font-medium text-text-secondary uppercase tracking-[0.06em] mb-2">
        Scheduled Tasks
      </h2>
      <p className="text-xs text-text-tertiary mb-6 leading-[1.6]">
        Tasks run automatically during normal app usage. The scheduler checks for due tasks
        on every page load and every 30 seconds.
      </p>

      {loading ? (
        <div className="text-sm text-text-tertiary">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-sm text-text-tertiary">No scheduled tasks registered.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => {
            const result = formatResult(task);
            return (
              <div
                key={task.name}
                className="rounded-xl border border-border-default bg-overlay-subtle p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2.5">
                    <Clock size={13} strokeWidth={1.5} className="text-text-tertiary" />
                    <span className="text-sm font-medium text-text-primary">{task.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-md bg-overlay-default px-2 py-0.5 text-caption font-mono text-text-tertiary">
                      every {formatInterval(task.intervalMs)}
                    </span>
                    {task.enabled ? (
                      <span className="flex items-center gap-1 text-caption font-medium text-emerald-400/70">
                        <CheckCircle2 size={10} strokeWidth={2} />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-caption font-medium text-text-muted">
                        <XCircle size={10} strokeWidth={2} />
                        Disabled
                      </span>
                    )}
                    <button
                      onClick={() => handleRunNow(task.name)}
                      disabled={running[task.name]}
                      className="flex items-center gap-1 rounded-md border border-border-strong bg-overlay-subtle px-2 py-0.5 text-caption font-medium text-text-secondary transition-colors hover:border-border-strong hover:bg-overlay-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Play size={8} strokeWidth={2} className={running[task.name] ? "animate-pulse" : ""} />
                      {running[task.name] ? "Running..." : "Run now"}
                    </button>
                  </div>
                </div>

                {task.description && (
                  <p className="text-xs text-text-tertiary mb-3 ml-[23px] leading-[1.5]">
                    {task.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs">
                  {task.lastRunAt ? (
                    <>
                      <span className="flex items-center gap-1.5 text-text-tertiary">
                        <RefreshCw size={10} strokeWidth={1.5} />
                        {formatTimeAgo(task.lastRunAt)}
                      </span>
                      {result && (
                        <span className={`flex items-center gap-1.5 ${
                          result.isError
                            ? "text-red-400/70"
                            : "text-text-tertiary"
                        }`}>
                          {result.isError && <AlertTriangle size={10} strokeWidth={1.5} />}
                          {result.text}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-text-muted">Never run</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
