"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import { buildChangelogMarkdown, buildChangelogPlainText } from "@/lib/changelog-export";
import type { ChangelogResponse, ChangelogTicketEntry } from "@/app/api/reports/changelog/route";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/shared/LoadingState";
import { FileText, ExternalLink, Copy, Check } from "lucide-react";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function TicketEntry({
  ticket,
  excluded,
  onToggle,
}: {
  ticket: ChangelogTicketEntry;
  excluded: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <li
      className={`group relative flex gap-3 py-3 transition-opacity duration-150 ${excluded ? "opacity-40" : ""}`}
    >
      {/* Checkbox */}
      <div className="mt-0.5 flex shrink-0 items-start pt-px">
        <label className="flex h-4 w-4 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={!excluded}
            onChange={() => onToggle(ticket.key)}
            className="sr-only"
          />
          <span
            className={`flex h-4 w-4 items-center justify-center rounded border transition-colors duration-100 ${
              excluded
                ? "border-white/[0.12] bg-transparent"
                : "border-[var(--color-brand-500)]/60 bg-[var(--color-brand-500)]/15"
            }`}
          >
            {!excluded && (
              <Check className="h-2.5 w-2.5 text-[var(--color-brand-400)]" strokeWidth={2.5} />
            )}
          </span>
        </label>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-caption text-white/25">{ticket.key}</span>
          <span className="text-sm font-medium leading-snug text-white/85">{ticket.title}</span>
          {ticket.storyPoints != null && (
            <span className="inline-flex h-4 items-center rounded-full border border-white/[0.10] px-1.5 text-caption tabular-nums text-white/30">
              {ticket.storyPoints} pts
            </span>
          )}
        </div>
        {ticket.description && (
          <p className="mt-1 text-xs leading-relaxed text-white/40 line-clamp-2">
            {ticket.description}
          </p>
        )}
        {ticket.prs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ticket.prs.map((pr) => (
              <a
                key={pr.url}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-2 py-0.5 text-caption text-[var(--color-brand-400)]/70 hover:border-[var(--color-brand-500)]/40 hover:bg-[var(--color-brand-500)]/[0.12] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand-400)] transition-colors duration-150"
              >
                <span className="max-w-[200px] truncate">{pr.title}</span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0" strokeWidth={1.5} />
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function ChangelogView({ sprintId }: { sprintId: string }) {
  const { data, isLoading, error } = useSWR<ChangelogResponse>(
    `/api/reports/changelog?sprint=${encodeURIComponent(sprintId)}`,
    swrFetcher,
  );

  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const handleToggleTicket = useCallback((key: string) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCopyMarkdown = useCallback(async () => {
    if (!data) return;
    const md = buildChangelogMarkdown(data, excludedKeys);
    await navigator.clipboard.writeText(md);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  }, [data, excludedKeys]);

  const handleCopyPlainText = useCallback(async () => {
    if (!data) return;
    const text = buildChangelogPlainText(data, excludedKeys);
    await navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  }, [data, excludedKeys]);

  const totalCompleted = data?.velocityStats.completedTickets ?? 0;
  const selectedCount = totalCompleted - excludedKeys.size;

  return (
    <>
      <ViewHeader
        icon={<FileText size={15} strokeWidth={1.5} />}
        actions={
          data && (
            <>
              <span className="text-xs text-white/25">
                {selectedCount}/{totalCompleted} tickets
              </span>
              <ViewHeaderDivider />
              <Button
                variant="ghost"
                size="md"
                icon={
                  copiedMd
                    ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                    : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                }
                onClick={handleCopyMarkdown}
                className={copiedMd ? "border-[var(--color-brand-500)]/40 text-[var(--color-brand-400)]" : ""}
              >
                {copiedMd ? "Copied" : "Copy Markdown"}
              </Button>
              <Button
                variant="ghost"
                size="md"
                icon={
                  copiedText
                    ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                    : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                }
                onClick={handleCopyPlainText}
                className={copiedText ? "border-[var(--color-brand-500)]/40 text-[var(--color-brand-400)]" : ""}
              >
                {copiedText ? "Copied" : "Copy as text"}
              </Button>
            </>
          )
        }
      >
        <ViewHeaderTitle>Release Notes</ViewHeaderTitle>
        {data && (
          <>
            <ViewHeaderDivider />
            <span className="text-xs text-white/40">{data.sprint.name}</span>
          </>
        )}
      </ViewHeader>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingState variant="spinner" label="Generating changelog..." />}

        {error && (
          <div className="flex items-center justify-center p-12">
            <p className="text-sm text-white/35">Failed to load release notes.</p>
          </div>
        )}

        {data && (
          <div className="mx-auto max-w-3xl px-8 py-10">
            {/* Sprint header */}
            <div className="mb-10 rounded-xl border border-white/[0.08] bg-[var(--color-brand-600)]/[0.04] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-tight text-white/90">
                    {data.sprint.name}
                  </h1>
                  {(data.sprint.startDate || data.sprint.endDate) && (
                    <p className="mt-1 text-sm text-white/35">
                      {formatDate(data.sprint.startDate)}
                      {data.sprint.startDate && data.sprint.endDate ? " – " : ""}
                      {formatDate(data.sprint.endDate)}
                    </p>
                  )}
                  {data.sprint.goal && (
                    <p className="mt-2 text-xs italic text-white/30">{data.sprint.goal}</p>
                  )}
                </div>

                {/* Velocity stats */}
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xl font-bold tabular-nums text-white/80">
                      {data.velocityStats.completedTickets}
                      <span className="ml-1 text-sm font-normal text-white/30">
                        / {data.velocityStats.totalTickets}
                      </span>
                    </div>
                    <div className="text-caption text-white/30">tickets done</div>
                  </div>
                  {data.velocityStats.completedPoints > 0 && (
                    <>
                      <div className="h-8 w-px bg-white/[0.08]" />
                      <div className="text-right">
                        <div className="text-xl font-bold tabular-nums text-white/80">
                          {data.velocityStats.completedPoints}
                          {data.velocityStats.totalPoints > 0 && (
                            <span className="ml-1 text-sm font-normal text-white/30">
                              / {data.velocityStats.totalPoints}
                            </span>
                          )}
                        </div>
                        <div className="text-caption text-white/30">story points</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Epic sections */}
            {data.epicGroups.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-white/25">No completed tickets in this sprint.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {data.epicGroups.map((group) => (
                  <section key={group.epic}>
                    {/* Epic heading */}
                    <div className="mb-3 flex items-center gap-3">
                      <div className="h-5 w-[3px] rounded-full bg-[var(--color-brand-500)]/50" />
                      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                        {group.epic}
                      </h2>
                      <div className="flex-1 border-t border-white/[0.06]" />
                      <span className="text-caption tabular-nums text-white/20">
                        {group.tickets.length}
                      </span>
                    </div>

                    {/* Ticket list */}
                    <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] bg-white/[0.015]">
                      {group.tickets.map((ticket) => (
                        <TicketEntry
                          key={ticket.key}
                          ticket={ticket}
                          excluded={excludedKeys.has(ticket.key)}
                          onToggle={handleToggleTicket}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
