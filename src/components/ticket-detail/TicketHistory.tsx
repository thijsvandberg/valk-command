"use client";

import { useState, useEffect, useCallback } from "react";
import type { Ticket, StoryVersion } from "@/types/ticket";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import type { DiffMode } from "@/components/story-diff/StoryDiff";
import { exportDiffAsMarkdown } from "@/components/story-diff/export-diff";
import { ChevronRight, ChevronLeft, Download } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const VERSION_TAGS = ["pre-refinement", "post-refinement", "final"] as const;

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  "pre-refinement": { bg: "rgba(234, 179, 8, 0.12)", text: "#eab308" },
  "post-refinement": { bg: "rgba(96, 165, 250, 0.12)", text: "#60a5fa" },
  "final": { bg: "rgba(46, 145, 73, 0.12)", text: "#4aaa60" },
};

export function TicketHistory({ ticket }: { ticket: Ticket }) {
  const [ticketVersions, setTicketVersions] = useState<StoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffMode, setDiffMode] = useState<DiffMode>("unified");
  const [versionTags, setVersionTags] = useState<Record<number, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/${ticket.key}/versions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          const mapped: StoryVersion[] = data.map((v: Record<string, unknown>, idx: number) => ({
            versionNumber: idx + 1,
            date: (v.createdAt as string) || new Date().toISOString(),
            source: "Jira sync" as const,
            contentHash: (v.contentHash as string) || "",
            qualityScore: null,
            content: (v.description as string) || "",
          }));
          setTicketVersions(mapped);
        }
      })
      .catch((err) => {
        console.error("Failed to load versions:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ticket.key]);

  const handleExportDiff = useCallback(
    (oldText: string, newText: string, oldLabel: string, newLabel: string) => {
      exportDiffAsMarkdown({
        ticketKey: ticket.key,
        oldText,
        newText,
        oldLabel,
        newLabel,
      });
    },
    [ticket.key],
  );

  const sorted = [...ticketVersions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const defaultNewVer = sorted.length > 0 ? sorted[0].versionNumber : null;
  const defaultOldVer = sorted.length > 1 ? sorted[1].versionNumber : null;
  const [compareOld, setCompareOld] = useState<number | null>(defaultOldVer);
  const [compareNew, setCompareNew] = useState<number | null>(defaultNewVer);

  const selectedIdx = selectedVersion !== null
    ? sorted.findIndex((v) => v.versionNumber === selectedVersion)
    : null;
  const current = selectedIdx !== null ? sorted[selectedIdx] : null;
  const previous = selectedIdx !== null ? sorted[selectedIdx + 1] ?? null : null;

  const compareOldVersion = sorted.find((v) => v.versionNumber === compareOld) ?? null;
  const compareNewVersion = sorted.find((v) => v.versionNumber === compareNew) ?? null;

  const selectStyle = "rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/70 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none";

  if (loading) {
    return (
      <div className="mt-8">
        <SectionHeader title="History" />
        <div className="mt-3 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-4 py-3">
              <div className="h-7 w-7 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.04]" />
              </div>
              <div className="h-3 w-8 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="History" count={0} />
        <p className="mt-3 text-sm text-white/30">No version history yet</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">History</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-white/40">
            {sorted.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-md border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setDiffMode("unified")}
              title="Unified diff view"
              className={`px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] ${
                diffMode === "unified"
                  ? "bg-white/[0.08] text-white/70"
                  : "text-white/30 hover:bg-white/[0.03] hover:text-white/50"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            >
              Unified
            </button>
            <button
              type="button"
              onClick={() => setDiffMode("side-by-side")}
              title="Side-by-side diff view"
              className={`border-l border-white/[0.08] px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] ${
                diffMode === "side-by-side"
                  ? "bg-white/[0.08] text-white/70"
                  : "text-white/30 hover:bg-white/[0.03] hover:text-white/50"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            >
              Split
            </button>
          </div>

        </div>
      </div>

      {sorted.length > 1 && (
        <div className="mt-3 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="text-xs text-white/40">Compare</span>
          <select
            value={compareOld ?? ""}
            onChange={(e) => setCompareOld(Number(e.target.value))}
            className={selectStyle}
          >
            {sorted.map((v) => (
              <option key={v.versionNumber} value={v.versionNumber}>
                v{v.versionNumber} - {formatVersionDate(v.date)}
              </option>
            ))}
          </select>
          <span className="text-xs text-white/20">with</span>
          <select
            value={compareNew ?? ""}
            onChange={(e) => setCompareNew(Number(e.target.value))}
            className={selectStyle}
          >
            {sorted.map((v) => (
              <option key={v.versionNumber} value={v.versionNumber}>
                v{v.versionNumber} - {formatVersionDate(v.date)}
              </option>
            ))}
          </select>
          {compareOldVersion && compareNewVersion && compareOld !== compareNew && (
            <button
              type="button"
              onClick={() => {
                setSelectedVersion(null);
              }}
              className="ml-2 rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
              style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
            >
              View comparison
            </button>
          )}
        </div>
      )}

      {selectedVersion === null && compareOldVersion && compareNewVersion && compareOld !== compareNew && sorted.length > 1 ? (
        <div className="mt-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-white/40">
              <span className="font-medium text-white/60">
                Version {compareOldVersion.versionNumber} &rarr; Version {compareNewVersion.versionNumber}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                handleExportDiff(
                  compareOldVersion.content,
                  compareNewVersion.content,
                  `v${compareOldVersion.versionNumber}`,
                  `v${compareNewVersion.versionNumber}`,
                )
              }
              className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
              title="Export diff as markdown"
            >
              <Download size={12} strokeWidth={1.2} />
              Export diff
            </button>
          </div>
          <StoryDiff
            oldText={compareOldVersion.content}
            newText={compareNewVersion.content}
            oldLabel={`v${compareOldVersion.versionNumber}`}
            newLabel={`v${compareNewVersion.versionNumber}`}
            mode={diffMode}
          />
        </div>
      ) : null}

      {selectedVersion !== null && current ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setSelectedVersion(null)}
            className="mb-3 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-white/50 cursor-pointer hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
          >
            <ChevronLeft size={14} strokeWidth={1.5} className="text-white/40" />
            Back to version list
          </button>

          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-white/40">
              <span className="font-medium text-white/60">
                {previous
                  ? `Version ${previous.versionNumber} \u2192 Version ${current.versionNumber}`
                  : `Version ${current.versionNumber} (initial)`}
              </span>
              <span>{formatVersionDate(current.date)}</span>
              <span
                className="rounded-full border px-2 py-0.5"
                style={{
                  borderColor: current.source === "Jira sync" ? "rgba(68, 170, 187, 0.3)" : "rgba(160, 90, 200, 0.3)",
                  color: current.source === "Jira sync" ? "#44aabb" : "#a05ac8",
                }}
              >
                {current.source}
              </span>
              {current.qualityScore !== null && (
                <span className="text-white/30">Quality: {current.qualityScore}</span>
              )}
            </div>
            {previous && (
              <button
                type="button"
                onClick={() =>
                  handleExportDiff(
                    previous.content,
                    current.content,
                    `v${previous.versionNumber}`,
                    `v${current.versionNumber}`,
                  )
                }
                className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                title="Export diff as markdown"
              >
                <Download size={12} strokeWidth={1.2} />
                Export diff
              </button>
            )}
          </div>

          {previous ? (
            <StoryDiff
              oldText={previous.content}
              newText={current.content}
              oldLabel={`v${previous.versionNumber}`}
              newLabel={`v${current.versionNumber}`}
              mode={diffMode}
            />
          ) : (
            <div className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5 font-[var(--font-body)] text-sm leading-[1.7] text-white/80 whitespace-pre-wrap">
              {current.content}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
          {sorted.map((version, idx) => {
            const isFirst = idx === sorted.length - 1;
            let scoreColor = "#94a3b8";
            if (version.qualityScore !== null) {
              if (version.qualityScore < 30) scoreColor = "#e5534b";
              else if (version.qualityScore < 70) scoreColor = "#ea8744";
              else scoreColor = "#4aaa60";
            }
            const currentTag = versionTags[version.versionNumber] ?? null;
            const tagColor = currentTag ? TAG_COLORS[currentTag] : null;

            return (
              <div
                key={version.versionNumber}
                onClick={() => setSelectedVersion(version.versionNumber)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.04] ${
                  idx < sorted.length - 1 ? "border-b border-white/[0.04]" : ""
                }`}
                style={{ transition: "background-color 0.15s ease" }}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold tabular-nums text-white/40">
                  v{version.versionNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/60">
                      {isFirst ? "Initial version" : `Version ${version.versionNumber}`}
                    </span>
                    <span
                      className="rounded-full border px-1.5 py-0.5 text-[10px]"
                      style={{
                        borderColor: version.source === "Jira sync" ? "rgba(68, 170, 187, 0.2)" : "rgba(160, 90, 200, 0.2)",
                        color: version.source === "Jira sync" ? "#44aabb" : "#a05ac8",
                      }}
                    >
                      {version.source}
                    </span>
                    {tagColor && currentTag && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: tagColor.bg, color: tagColor.text }}
                      >
                        {currentTag}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-white/25">
                    {formatVersionDate(version.date)}
                  </div>
                </div>
                <select
                  value={currentTag ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    const newTag = e.target.value || null;
                    setVersionTags((prev) => ({ ...prev, [version.versionNumber]: newTag }));
                  }}
                  className="shrink-0 rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/40 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                  title="Set version tag"
                >
                  <option value="">No tag</option>
                  {VERSION_TAGS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {version.qualityScore !== null && (
                  <div className="flex items-center gap-1.5 tabular-nums text-xs" style={{ color: scoreColor }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: scoreColor }} />
                    {version.qualityScore}
                  </div>
                )}
                <ChevronRight size={10} strokeWidth={1} className="shrink-0 text-white/15" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
