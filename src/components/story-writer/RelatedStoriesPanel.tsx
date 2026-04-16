"use client";

import { useState, useCallback, useEffect } from "react";
import { Link2, Link2Off, ExternalLink, ChevronLeft, Loader2 } from "lucide-react";
import { apiFetch, tickets, jira } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { JiraStatus } from "@/types/ticket";
import type { RelatedStoryCandidateRow } from "@/db/schema";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";

interface RelatedStoriesPanelProps {
  candidates: RelatedStoryCandidateRow[];
  onLink: (candidateId: string, isLinked: boolean) => Promise<void>;
  onClose: () => void;
  selectedKey: string | null;
  onSelectedKeyChange: (key: string | null) => void;
}

interface TicketPreview {
  title: string;
  description: string | null;
  type: string | null;
  status: string;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
      : score >= 60
        ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
        : "bg-white/[0.06] text-white/40 border-white/[0.08]";

  return (
    <span className={`inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold tabular-nums border shrink-0 ${color}`}>
      {score}
    </span>
  );
}

function MiniStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase() as JiraStatus;
  return <StatusBadge status={normalized} />;
}

function CandidateCard({
  candidate,
  onLink,
  onSelect,
  isSelected,
}: {
  candidate: RelatedStoryCandidateRow;
  onLink: (isLinked: boolean) => Promise<void>;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const [linking, setLinking] = useState(false);
  const jiraUrl = candidate.jiraUrl ?? `https://new-story.atlassian.net/browse/${candidate.jiraKey}`;

  const handleLinkToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLinking(true);
    await onLink(!candidate.isLinked);
    setLinking(false);
  }, [candidate.isLinked, onLink]);

  const handleKeyClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    // CMD+click or middle-click: open in new tab (default anchor behavior with target=_blank)
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    e.preventDefault();
    onSelect();
  }, [onSelect]);

  return (
    <div
      className={`group rounded-lg border cursor-pointer transition-colors duration-150 ${
        isSelected
          ? "border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/[0.06]"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
      }`}
      onClick={onSelect}
    >
      {/* Top row: score, key, icon, status, link button */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
        <ScoreBadge score={candidate.score} />
        {candidate.issueType && (
          <IssueTypeIcon type={candidate.issueType.toLowerCase()} size={13} />
        )}
        <a
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleKeyClick}
          className="font-mono text-[11px] font-semibold text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-100 shrink-0"
        >
          {candidate.jiraKey}
        </a>
        <MiniStatusBadge status={candidate.status} />
        <div className="ml-auto shrink-0">
          <button
            type="button"
            onClick={handleLinkToggle}
            disabled={linking}
            title={candidate.isLinked ? "Unlink from story" : "Link as related story"}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-150 cursor-pointer disabled:opacity-50 ${
              candidate.isLinked
                ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                : "border-white/[0.10] bg-white/[0.03] text-white/45 hover:border-[var(--color-brand-500)]/25 hover:bg-[var(--color-brand-500)]/08 hover:text-[var(--color-brand-400)]"
            }`}
          >
            {linking ? (
              <Loader2 size={10} className="animate-spin" />
            ) : candidate.isLinked ? (
              <Link2 size={10} strokeWidth={1.5} />
            ) : (
              <Link2Off size={10} strokeWidth={1.5} />
            )}
            {candidate.isLinked ? "Linked" : "Link"}
          </button>
        </div>
      </div>
      {/* Title + match reason */}
      <div className="px-3 pt-0.5 pb-2.5">
        <p className="text-[13px] leading-[1.45] text-white/70 line-clamp-2">
          {candidate.title}
        </p>
        {candidate.matchReason && (
          <p className="mt-1 text-[11px] italic text-white/30 line-clamp-1">
            {candidate.matchReason}
          </p>
        )}
      </div>
    </div>
  );
}

// Component remounts when jiraKey changes (via key prop), so no deps needed in the effect.
function TicketDetail({
  jiraKey,
  onBack,
}: {
  jiraKey: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<TicketPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchTicket = async () => {
      // First try local DB
      try {
        const d = await tickets.get(jiraKey);
        if (d?.title) {
          return d;
        }
      } catch {
        // Not found locally
      }
      // Not in local DB — trigger a Jira sync, then re-fetch
      await jira.syncTickets({ ticketKeys: [jiraKey] })
        .catch((err) => console.warn("[related-stories] background sync failed", err));
      try {
        return await tickets.get(jiraKey);
      } catch {
        return null;
      }
    };

    fetchTicket()
      .then((d) => {
        if (cancelled) return;
        if (d?.title) {
          setData({
            title: d.title ?? jiraKey,
            description: d.description ?? null,
            type: d.type ?? null,
            status: d.jiraStatus ?? "",
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jiraUrl = `https://new-story.atlassian.net/browse/${jiraKey}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<ChevronLeft size={13} strokeWidth={1.5} />}
          onClick={onBack}
          className="border-0 bg-transparent text-white/40 hover:text-white/70"
        >
          Back
        </Button>
        <span className="font-mono text-[11px] font-semibold text-white/60">{jiraKey}</span>
        <a
          href={`/tickets/${jiraKey}/write`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open story writer in new tab"
          className="ml-auto flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 cursor-pointer transition-colors duration-150"
        >
          <ExternalLink size={11} strokeWidth={1.5} />
          Story writer
        </a>
        <a
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Jira"
          className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 cursor-pointer transition-colors duration-150"
        >
          <ExternalLink size={11} strokeWidth={1.5} />
          Jira
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-white/25" />
          </div>
        ) : data ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {data.type && <IssueTypeIcon type={data.type.toLowerCase()} size={14} />}
              <MiniStatusBadge status={data.status} />
            </div>
            <h3 className="text-[13px] font-semibold leading-[1.4] text-white/85">
              {data.title}
            </h3>
            {data.description ? (
              <div className="description-content text-[12px] leading-[1.7] text-white/60">
                {renderMarkdown(data.description)}
              </div>
            ) : (
              <p className="text-[12px] text-white/25 italic">No description</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] text-white/35">
              Story not in local database.
            </p>
            <a
              href={jiraUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] transition-colors duration-150"
            >
              <ExternalLink size={11} strokeWidth={1.5} />
              Open in Jira
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function RelatedStoriesPanel({ candidates, onLink, onClose, selectedKey, onSelectedKeyChange }: RelatedStoriesPanelProps) {

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {selectedKey ? (
        <TicketDetail
          key={selectedKey}
          jiraKey={selectedKey}
          onBack={() => onSelectedKeyChange(null)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
          {candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-[12px] text-white/25">
                No related stories found yet.
              </p>
              <p className="mt-1 text-[11px] text-white/15">
                Use the Find Related quick action in the chat.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  onLink={(isLinked) => onLink(c.id, isLinked)}
                  onSelect={() => onSelectedKeyChange(c.jiraKey)}
                  isSelected={selectedKey === c.jiraKey}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
