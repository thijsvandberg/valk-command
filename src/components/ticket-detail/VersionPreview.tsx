"use client";

import type { StoryVersion } from "@/types/ticket";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/shared/Tag";
import { VersionPicker, type VersionOption } from "@/components/shared/VersionPicker";
import { renderMarkdown } from "./renderMarkdown";
import { formatVersionDate } from "./version-utils";
import { usePrismLanguages } from "@/hooks/usePrismLanguages";

export interface VersionPreviewProps {
  version: StoryVersion;
  versionOptions: VersionOption[];
  loadingContent: boolean;
  onVersionChange: (versionNumber: number) => void;
  onBack: () => void;
  onOpenDiff: (versionNumber: number) => void;
}

export function VersionPreview({
  version,
  versionOptions,
  loadingContent,
  onVersionChange,
  onBack,
  onOpenDiff,
}: VersionPreviewProps) {
  usePrismLanguages(version.content);
  const isFirst = version.versionNumber === 1;
  const title =
    version.label === "draft"
      ? "Local draft"
      : version.label === "ai-draft"
      ? version.updatedBy ?? "AI Draft"
      : isFirst
      ? "Initial version"
      : `Version ${version.versionNumber}`;

  return (
    <>
      {/* Header bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-overlay-default hover:text-text-secondary cursor-pointer"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            title="Back to version list"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
          </button>
          <VersionPicker
            options={versionOptions}
            selectedId={String(version.versionNumber)}
            onSelect={(id) => onVersionChange(Number(id))}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenDiff(version.versionNumber)}
        >
          Compare
        </Button>
      </div>

      {/* Version metadata */}
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-border-default bg-overlay-subtle px-4 py-3">
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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-overlay-subtle text-caption font-semibold tabular-nums text-text-tertiary">
            v{version.versionNumber}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-secondary">{title}</span>
            {version.label === "current" && <Tag color="brand">Jira</Tag>}
            {version.label === "draft" && <Tag color="blue">Draft</Tag>}
            {version.label === "ai-draft" && <Tag color="purple">AI</Tag>}
            {version.updatedBy && (
              <span className="text-xs text-text-tertiary">{version.updatedBy}</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            {formatVersionDate(version.date)}
          </div>
        </div>
      </div>

      {/* Content */}
      {loadingContent ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-overlay-subtle" style={{ width: `${60 + i * 7}%` }} />
          ))}
        </div>
      ) : version.content ? (
        <div className="description-content">
          {renderMarkdown(version.content)}
        </div>
      ) : (
        <p className="text-sm text-text-muted">No content available for this version.</p>
      )}
    </>
  );
}
