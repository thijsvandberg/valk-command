"use client";

import { FileCode } from "lucide-react";
import type { InvestigationKeyFile } from "@/lib/investigation-parser";
import { Tooltip } from "@/components/shared/Tooltip";
import { CollapsibleSection } from "./CollapsibleSection";

function extractRepoBadge(filePath: string): string | null {
  const firstSlash = filePath.indexOf("/");
  if (firstSlash <= 0) return null;
  const prefix = filePath.slice(0, firstSlash);
  // Only show a repo badge for known multi-word prefixes or paths that look like repo names
  if (prefix.includes("-") || prefix.includes("_") || prefix.length > 3) {
    return prefix;
  }
  return null;
}

function truncatePath(filePath: string): { directory: string; filename: string } {
  const lastSlash = filePath.lastIndexOf("/");
  if (lastSlash < 0) return { directory: "", filename: filePath };
  return {
    directory: filePath.slice(0, lastSlash + 1),
    filename: filePath.slice(lastSlash + 1),
  };
}

function FileRow({ file }: { file: InvestigationKeyFile }) {
  const repo = extractRepoBadge(file.file);
  const { directory, filename } = truncatePath(file.file);

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/[0.03] last:border-0 group">
      <FileCode
        size={13}
        strokeWidth={1.5}
        className="text-white/20 shrink-0"
      />
      {repo && (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-white/[0.06] text-white/35">
          {repo}
        </span>
      )}
      <Tooltip content={file.file}>
        <span className="font-mono text-xs text-white/60 min-w-0 truncate max-w-[280px]">
          <span className="text-white/30">{directory}</span>
          <span className="text-[var(--color-brand-300)]">{filename}</span>
        </span>
      </Tooltip>
      <span className="text-[11px] text-white/35 flex-1 text-right truncate hidden sm:block">
        {file.purpose}
      </span>
    </div>
  );
}

interface KeyFilesSectionProps {
  files: InvestigationKeyFile[];
  defaultOpen?: boolean;
}

export function KeyFilesSection({ files, defaultOpen = false }: KeyFilesSectionProps) {
  if (files.length === 0) return null;

  return (
    <CollapsibleSection title="Key files" icon={FileCode} defaultOpen={defaultOpen}>
      <div className="space-y-0">
        {files.map((file) => (
          <FileRow key={file.file} file={file} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
