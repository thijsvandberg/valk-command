"use client";

import type { StoryVersion } from "@/types/ticket";
import { ChevronRight, Download } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { VersionPicker, type VersionOption } from "@/components/shared/VersionPicker";
import { Tag } from "@/components/shared/Tag";
import { formatVersionDate } from "./version-utils";

export interface VersionListProps {
  sorted: StoryVersion[];
  isDraftOutdated: boolean;
  oldOptions: VersionOption[];
  newOptions: VersionOption[];
  compareOld: number | null;
  compareNew: number | null;
  importing: boolean;
  importResult: { imported: number; skipped: number; total: number } | null;
  onVersionClick: (versionNumber: number) => void;
  onOldChange: (val: number) => void;
  onNewChange: (val: number) => void;
  onImportHistory: () => void;
}

export function VersionList({
  sorted,
  isDraftOutdated,
  oldOptions,
  newOptions,
  compareOld,
  compareNew,
  importing,
  importResult,
  onVersionClick,
  onOldChange,
  onNewChange,
  onImportHistory,
}: VersionListProps) {
  const compareBar = (
    <div className="flex items-center gap-2">
      <VersionPicker
        options={oldOptions}
        selectedId={compareOld !== null ? String(compareOld) : ""}
        onSelect={(id) => onOldChange(Number(id))}
      />
      <span className="shrink-0 text-xs text-white/25">vs</span>
      <VersionPicker
        options={newOptions}
        selectedId={compareNew !== null ? String(compareNew) : ""}
        onSelect={(id) => onNewChange(Number(id))}
      />
    </div>
  );

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">History</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-caption font-medium tabular-nums text-white/40">
            {sorted.length}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={importing}
          onClick={onImportHistory}
          title="Import full description history from Jira"
          icon={<Download size={12} strokeWidth={1.5} className={importing ? "animate-pulse" : ""} />}
        >
          {importing ? "Importing..." : "Import Jira history"}
        </Button>
      </div>

      {/* Import result feedback */}
      {importResult && (
        <div className="mt-2 rounded-lg border border-border-default bg-white/[0.02] px-4 py-2.5 text-xs text-white/50">
          {importResult.imported > 0
            ? `Imported ${importResult.imported} version${importResult.imported !== 1 ? "s" : ""} from Jira${importResult.skipped > 0 ? ` (${importResult.skipped} already existed)` : ""}.`
            : "History is up to date. No new versions found in Jira."}
        </div>
      )}

      {/* Compare dropdowns */}
      {sorted.length > 1 && (
        <div className="mt-3 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-white/[0.02] px-4 py-3">
          {compareBar}
        </div>
      )}

      {/* Version list */}
      <div className="mt-3 overflow-hidden rounded-lg border border-border-default">
        {sorted.map((version, idx) => {
          const isFirst = idx === sorted.length - 1;
          const isOutdated = version.label === "draft" && isDraftOutdated;
          return (
            <div
              key={version.versionNumber}
              onClick={() => onVersionClick(version.versionNumber)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.04] ${
                idx < sorted.length - 1 ? "border-b border-border-subtle" : ""
              }`}
              style={{ transition: "background-color 0.15s ease" }}
            >
              {version.updatedByAvatar ? (
                <Image
                  src={version.updatedByAvatar}
                  alt={version.updatedBy ?? ""}
                  width={28}
                  height={28}
                  unoptimized
                  className="h-7 w-7 shrink-0 rounded-full"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-white/[0.03] text-caption font-semibold tabular-nums text-white/40">
                  v{version.versionNumber}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/60">
                    {version.label === "draft"
                      ? "Local draft"
                      : version.label === "ai-draft"
                      ? version.updatedBy ?? "AI Draft"
                      : isFirst
                      ? "Initial version"
                      : `Version ${version.versionNumber}`}
                  </span>
                  {version.label === "current" && (
                    <Tag color="brand">Jira</Tag>
                  )}
                  {version.label === "draft" && (
                    <Tag color="blue">Draft</Tag>
                  )}
                  {version.label === "ai-draft" && (
                    <Tag color="purple">AI</Tag>
                  )}
                  {isOutdated && (
                    <Tag color="amber">Outdated</Tag>
                  )}
                  {version.updatedBy && (
                    <span className="text-xs text-white/30">{version.updatedBy}</span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-white/25">
                  {formatVersionDate(version.date)}
                </div>
              </div>
              <ChevronRight size={10} strokeWidth={1} className="shrink-0 text-white/15" />
            </div>
          );
        })}
      </div>
    </>
  );
}
