import Link from "next/link";
import {
  Bell,
  GitBranch,
  Rocket,
  GitPullRequest,
  RefreshCw,
  NotebookPen,
  Info,
  Bot,
  Timer,
} from "lucide-react";

export function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatExactTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Shows a late-sync indicator when eventAt is more than 30 minutes before createdAt.
// The threshold avoids false positives from minor clock skew or short polling delays.
export const LATE_SYNC_THRESHOLD_MS = 30 * 60 * 1000;

export function renderMessage(
  message: string,
  jiraKey: string | null,
  href: string | null,
  onLinkClick: () => void,
): React.ReactNode {
  if (!jiraKey || !href || !message.includes(jiraKey)) return message;
  const idx = message.indexOf(jiraKey);
  return (
    <>
      {message.slice(0, idx)}
      <Link
        href={href}
        onClick={onLinkClick}
        className="font-mono text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150"
      >
        {jiraKey}
      </Link>
      {message.slice(idx + jiraKey.length)}
    </>
  );
}

export function notificationIcon(type: string) {
  switch (type) {
    case "deployment":
      return <Rocket size={13} strokeWidth={1.5} className="text-violet-400" />;
    case "pipeline":
      return <GitBranch size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />;
    case "pr":
      return <GitPullRequest size={13} strokeWidth={1.5} className="text-amber-400" />;
    case "sync":
      return <RefreshCw size={13} strokeWidth={1.5} className="text-emerald-400" />;
    case "story-writer":
      return <NotebookPen size={13} strokeWidth={1.5} className="text-sky-400" />;
    case "system":
      return <Info size={13} strokeWidth={1.5} className="text-text-tertiary" />;
    case "agent":
      return <Bot size={13} strokeWidth={1.5} className="text-purple-400" />;
    case "scheduler":
      return <Timer size={13} strokeWidth={1.5} className="text-orange-400" />;
    default:
      return <Bell size={13} strokeWidth={1.5} className="text-text-tertiary" />;
  }
}

export function typeLabel(type: string): string {
  switch (type) {
    case "pr":           return "Pull requests";
    case "pipeline":     return "Pipelines";
    case "deployment":   return "Deployments";
    case "story-writer": return "Story writer";
    case "sync":         return "Sync";
    case "agent":        return "Agent";
    case "scheduler":    return "Scheduler";
    case "system":       return "System";
    default:             return type;
  }
}

// Extracts team prefix from a sprint display name (e.g. "BM: 135" -> "BM").
export function extractTeamPrefix(sprintName: string | null): string | null {
  if (!sprintName) return null;
  const idx = sprintName.indexOf(": ");
  return idx > 0 ? sprintName.slice(0, idx) : null;
}
