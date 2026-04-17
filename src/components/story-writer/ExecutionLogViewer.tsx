"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch, storyWriter } from "@/lib/api-client";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Terminal, Wrench, FileText, AlertCircle, Cpu } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface LogEntry {
  type: "prompt" | "system" | "text" | "tool_use" | "tool_result" | "result" | "error";
  timestamp: string;
  content?: string;
  sessionId?: string;
  model?: string;
  tools?: string[];
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  toolUseId?: string;
  output?: string;
  durationMs?: number;
  usage?: Record<string, unknown>;
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

function CollapsibleText({ label, text, mono = true, defaultOpen = false }: { label: string; text: string; mono?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const preview = text.slice(0, 140).replace(/\n/g, " ");
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-1.5 text-left cursor-pointer hover:text-white transition-colors duration-100"
      >
        {open
          ? <ChevronDown size={12} className="mt-0.5 shrink-0 text-white/70" />
          : <ChevronRight size={12} className="mt-0.5 shrink-0 text-white/70" />
        }
        {label && <span className="text-xs font-semibold text-white/80 shrink-0">{label}</span>}
        {!open && <span className="text-xs text-white/65 truncate">{preview}{text.length > 140 ? "…" : ""}</span>}
      </button>
      {open && (
        <pre className={`mt-2 ml-4 whitespace-pre-wrap break-words rounded-md bg-black/30 border border-white/[0.12] px-3 py-2.5 text-body leading-[1.75] text-white/90 ${mono ? "font-mono" : ""}`}>
          {text}
        </pre>
      )}
    </div>
  );
}

function EntryLabel({ icon, label, time, color = "text-white/80" }: { icon: React.ReactNode; label: string; time: string; color?: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${color}`}>
      {icon}
      <span className="font-semibold">{label}</span>
      <span className="ml-auto text-white/50 tabular-nums">{time}</span>
    </div>
  );
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  switch (entry.type) {
    case "prompt":
      return (
        <div className="rounded-md border border-white/[0.12] bg-white/[0.05] px-3 py-2.5 space-y-2">
          <EntryLabel
            icon={<Terminal size={12} className="text-white/70" />}
            label="Prompt"
            time={formatTs(entry.timestamp)}
          />
          <CollapsibleText label="" text={entry.content ?? ""} />
        </div>
      );

    case "system":
      return (
        <div className="rounded-md border border-white/[0.10] bg-white/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-white/70">
            <Cpu size={12} className="text-white/60" />
            <span className="font-semibold">Session init</span>
            <span className="font-mono text-white/80">{entry.model}</span>
            <span className="ml-auto text-white/50 tabular-nums">{formatTs(entry.timestamp)}</span>
          </div>
        </div>
      );

    case "text":
      return (
        <div className="rounded-md border border-white/[0.12] bg-white/[0.05] px-3 py-2.5 space-y-2">
          <EntryLabel
            icon={<FileText size={12} className="text-white/70" />}
            label="Text"
            time={formatTs(entry.timestamp)}
          />
          <CollapsibleText label="" text={entry.content ?? ""} mono={false} defaultOpen />
        </div>
      );

    case "tool_use":
      return (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Wrench size={12} className="text-amber-400" />
            <span className="font-mono font-semibold text-amber-300">{entry.name}</span>
            <span className="ml-auto text-white/50 tabular-nums">{formatTs(entry.timestamp)}</span>
          </div>
          {entry.input && Object.keys(entry.input).length > 0 && (
            <CollapsibleText label="input" text={JSON.stringify(entry.input, null, 2)} />
          )}
        </div>
      );

    case "tool_result":
      return (
        <div className="rounded-md border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-white/75">
            <span className="font-mono text-white/60 text-sm">↳</span>
            <span className="font-semibold">Tool result</span>
            <span className="ml-auto text-white/50 tabular-nums">{formatTs(entry.timestamp)}</span>
          </div>
          {entry.content && (
            <CollapsibleText label="" text={entry.content} />
          )}
        </div>
      );

    case "result":
      return (
        <div className="rounded-md border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.08] px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[var(--color-brand-300)]">Result</span>
            {entry.durationMs && (
              <span className="text-white/70">{(entry.durationMs / 1000).toFixed(1)}s</span>
            )}
            {entry.usage && (
              <span className="text-white/60">
                {String((entry.usage as Record<string, unknown>).input_tokens ?? 0)} in · {String((entry.usage as Record<string, unknown>).output_tokens ?? 0)} out
              </span>
            )}
            <span className="ml-auto text-white/50 tabular-nums">{formatTs(entry.timestamp)}</span>
          </div>
          {entry.output && (
            <CollapsibleText label="" text={entry.output} mono={false} defaultOpen />
          )}
        </div>
      );

    case "error":
      return (
        <div className="rounded-md border border-red-500/30 bg-red-500/[0.08] px-3 py-2.5 space-y-2">
          <EntryLabel
            icon={<AlertCircle size={12} />}
            label="Error"
            time={formatTs(entry.timestamp)}
            color="text-red-400"
          />
          <p className="text-xs text-red-300 ml-5">{entry.message}</p>
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
    storyWriter.getLogs(ticketKey, taskId)
      .then((data: unknown) => { if (!cancelled) setEntries((data as { log?: LogEntry[] }).log ?? []); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [taskId, ticketKey]);

  if (error) return <p className="px-2 py-3 text-xs text-red-400/70">Failed to load log</p>;
  if (!entries) return (
    <div className="flex items-center gap-2 px-2 py-3">
      <Loader2 size={12} className="animate-spin text-white/40" />
      <span className="text-xs text-white/40">Loading…</span>
    </div>
  );
  if (entries.length === 0) return <p className="px-2 py-3 text-xs text-white/35">No entries</p>;

  return (
    <div className="space-y-1.5 py-2.5">
      {entries.map((entry, i) => (
        <LogEntryRow key={i} entry={entry} />
      ))}
    </div>
  );
}

function TaskLogRow({ log, ticketKey }: { log: LogMeta; ticketKey: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border-strong bg-white/[0.025] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-3 text-left cursor-pointer hover:bg-hover-interactive transition-colors duration-100"
      >
        {expanded
          ? <ChevronDown size={13} className="shrink-0 text-white/70" />
          : <ChevronRight size={13} className="shrink-0 text-white/70" />
        }
        <span className="font-mono text-sm font-medium text-white/85">{log.taskId}</span>
        <span className="ml-auto text-xs text-white/55 tabular-nums">{formatTs(log.createdAt)}</span>
      </button>
      {expanded && (
        <div className="border-t border-border-default px-3">
          <TaskLogDetail taskId={log.taskId} ticketKey={ticketKey} />
        </div>
      )}
    </div>
  );
}

interface ExecutionLogViewerProps {
  ticketKey: string;
  isStreaming?: boolean;
}

export function ExecutionLogViewer({ ticketKey, isStreaming }: ExecutionLogViewerProps) {
  const [logs, setLogs] = useState<LogMeta[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ logs?: LogMeta[] }>(`/api/tickets/${encodeURIComponent(ticketKey)}/story-writer/logs`);
      setLogs(data.logs ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [ticketKey]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh logs while streaming is active
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(load, 5_000);
    return () => clearInterval(interval);
  }, [isStreaming, load]);

  // Refresh once when streaming ends to pick up final log
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (isStreaming) {
      wasStreaming.current = true;
    } else if (wasStreaming.current) {
      wasStreaming.current = false;
      load();
    }
  }, [isStreaming, load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
        <span className="text-xs font-medium text-white/45">Execution logs</span>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<RefreshCw size={12} className={loading ? "animate-spin" : ""} />}
          onClick={load}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh"
          className="border-0 bg-transparent text-white/35 hover:text-white/60"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading && !logs && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 size={14} className="animate-spin text-white/35" />
            <span className="text-xs text-white/35">Loading…</span>
          </div>
        )}

        {!loading && logs?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12">
            <Terminal size={18} className="text-white/20" strokeWidth={1.5} />
            <p className="text-xs text-white/30 text-center">No logs yet. Send a message to start.</p>
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
