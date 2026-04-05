"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Terminal, Wrench, FileText, AlertCircle, Cpu } from "lucide-react";

interface LogEntry {
  type: "prompt" | "system" | "text" | "tool_use" | "tool_result" | "result" | "error";
  timestamp: string;
  // prompt
  content?: string;
  // system
  sessionId?: string;
  model?: string;
  tools?: string[];
  // text (content already covers this)
  // tool_use
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result
  toolUseId?: string;
  // result
  output?: string;
  durationMs?: number;
  usage?: Record<string, unknown>;
  // error
  message?: string;
  details?: string;
}

interface LogMeta {
  id: string;
  taskId: string;
  createdAt: string;
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

function CollapsibleText({ label, text, mono = true }: { label: string; text: string; mono?: boolean }) {
  const [open, setOpen] = useState(false);
  const preview = text.slice(0, 120).replace(/\n/g, " ");
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-1.5 text-left cursor-pointer hover:text-white/80 transition-colors duration-100"
      >
        {open ? <ChevronDown size={12} className="mt-0.5 shrink-0 text-white/30" /> : <ChevronRight size={12} className="mt-0.5 shrink-0 text-white/30" />}
        <span className="text-[10px] font-medium text-white/40 shrink-0">{label}</span>
        {!open && <span className="text-[10px] text-white/25 truncate">{preview}{text.length > 120 ? "…" : ""}</span>}
      </button>
      {open && (
        <pre className={`mt-1.5 ml-4 whitespace-pre-wrap break-words rounded bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[10px] leading-[1.7] text-white/65 ${mono ? "font-mono" : ""}`}>
          {text}
        </pre>
      )}
    </div>
  );
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  switch (entry.type) {
    case "prompt":
      return (
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-white/35">
            <Terminal size={10} />
            <span className="font-medium">Prompt</span>
            <span className="text-white/20">{formatTs(entry.timestamp)}</span>
          </div>
          <CollapsibleText label="" text={entry.content ?? ""} />
        </div>
      );

    case "system":
      return (
        <div className="rounded-md border border-white/[0.04] bg-white/[0.015] px-3 py-2">
          <div className="flex items-center gap-2 text-[10px] text-white/25">
            <Cpu size={10} />
            <span>Session init</span>
            <span className="font-mono text-white/20">{entry.model}</span>
            <span className="text-white/15">{formatTs(entry.timestamp)}</span>
          </div>
        </div>
      );

    case "text":
      return (
        <div className="rounded-md border border-white/[0.05] bg-white/[0.02] px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-white/30">
            <FileText size={10} />
            <span className="font-medium">Text</span>
            <span className="text-white/20">{formatTs(entry.timestamp)}</span>
          </div>
          <CollapsibleText label="" text={entry.content ?? ""} mono={false} />
        </div>
      );

    case "tool_use":
      return (
        <div className="rounded-md border border-amber-500/10 bg-amber-500/[0.03] px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px]">
            <Wrench size={10} className="text-amber-400/60" />
            <span className="font-mono font-medium text-amber-400/70">{entry.name}</span>
            <span className="text-white/20">{formatTs(entry.timestamp)}</span>
          </div>
          {entry.input && Object.keys(entry.input).length > 0 && (
            <CollapsibleText label="input" text={JSON.stringify(entry.input, null, 2)} />
          )}
        </div>
      );

    case "tool_result":
      return (
        <div className="rounded-md border border-white/[0.04] bg-white/[0.015] px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-white/25">
            <span className="text-white/15 font-mono">↳</span>
            <span>Tool result</span>
            <span className="text-white/15">{formatTs(entry.timestamp)}</span>
          </div>
          {entry.content && (
            <CollapsibleText label="" text={entry.content} />
          )}
        </div>
      );

    case "result":
      return (
        <div className="rounded-md border border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.03] px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[var(--color-brand-400)]/60 font-medium">Result</span>
            {entry.durationMs && (
              <span className="text-white/25">{(entry.durationMs / 1000).toFixed(1)}s</span>
            )}
            {entry.usage && (
              <span className="text-white/20">
                {String((entry.usage as Record<string, unknown>).input_tokens ?? 0)} in / {String((entry.usage as Record<string, unknown>).output_tokens ?? 0)} out
              </span>
            )}
            <span className="text-white/15">{formatTs(entry.timestamp)}</span>
          </div>
          {entry.output && (
            <CollapsibleText label="" text={entry.output} mono={false} />
          )}
        </div>
      );

    case "error":
      return (
        <div className="rounded-md border border-red-500/15 bg-red-500/[0.04] px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-red-400/70">
            <AlertCircle size={10} />
            <span className="font-medium">Error</span>
            <span className="text-white/15">{formatTs(entry.timestamp)}</span>
          </div>
          <p className="text-[10px] text-red-400/60">{entry.message}</p>
          {entry.details && (
            <CollapsibleText label="details" text={entry.details} />
          )}
        </div>
      );

    default:
      return null;
  }
}

function TaskLogDetail({ taskId, ticketKey }: { taskId: string; ticketKey: string }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/story-writer/logs/${encodeURIComponent(taskId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => { if (!cancelled) setEntries(data.log ?? []); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [taskId, ticketKey]);

  if (error) return <p className="px-2 py-3 text-[10px] text-red-400/60">Failed to load log</p>;
  if (!entries) return (
    <div className="flex items-center gap-1.5 px-2 py-3">
      <Loader2 size={10} className="animate-spin text-white/30" />
      <span className="text-[10px] text-white/30">Loading…</span>
    </div>
  );
  if (entries.length === 0) return <p className="px-2 py-3 text-[10px] text-white/25">No entries</p>;

  return (
    <div className="space-y-1.5 py-2">
      {entries.map((entry, i) => (
        <LogEntryRow key={i} entry={entry} />
      ))}
    </div>
  );
}

function TaskLogRow({ log, ticketKey }: { log: LogMeta; ticketKey: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-white/[0.03] transition-colors duration-100"
      >
        {expanded
          ? <ChevronDown size={12} className="shrink-0 text-white/30" />
          : <ChevronRight size={12} className="shrink-0 text-white/30" />
        }
        <span className="font-mono text-[10px] text-white/40">{log.taskId}</span>
        <span className="ml-auto text-[10px] text-white/20">{formatTs(log.createdAt)}</span>
      </button>
      {expanded && (
        <div className="border-t border-white/[0.05] px-3">
          <TaskLogDetail taskId={log.taskId} ticketKey={ticketKey} />
        </div>
      )}
    </div>
  );
}

interface ExecutionLogViewerProps {
  ticketKey: string;
}

export function ExecutionLogViewer({ ticketKey }: ExecutionLogViewerProps) {
  const [logs, setLogs] = useState<LogMeta[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/story-writer/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [ticketKey]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-white/30">Execution logs</span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex h-6 w-6 items-center justify-center rounded text-white/25 cursor-pointer hover:text-white/50 hover:bg-white/[0.06] transition-colors duration-150 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading && !logs && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 size={14} className="animate-spin text-white/25" />
            <span className="text-xs text-white/25">Loading…</span>
          </div>
        )}

        {!loading && logs?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12">
            <Terminal size={18} className="text-white/15" strokeWidth={1.5} />
            <p className="text-xs text-white/20 text-center">No logs yet. Send a message to start.</p>
          </div>
        )}

        {logs && logs.length > 0 && (
          <div className="space-y-2">
            {logs.map((log) => (
              <TaskLogRow key={log.id} log={log} ticketKey={ticketKey} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
