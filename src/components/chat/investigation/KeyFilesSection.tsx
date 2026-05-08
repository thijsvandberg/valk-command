"use client";

import { FileCode } from "lucide-react";
import type { InvestigationKeyFile } from "@/lib/investigation-parser";
import { CollapsibleSection } from "./CollapsibleSection";

function extractRepoBadge(filePath: string): string | null {
  const firstSlash = filePath.indexOf("/");
  if (firstSlash <= 0) return null;
  const prefix = filePath.slice(0, firstSlash);
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
    <div className="py-1.5 border-b border-border-subtle last:border-0">
      <div className="flex items-center gap-2">
        <FileCode size={13} strokeWidth={1.5} className="text-text-muted shrink-0" />
        {repo && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-caption font-medium bg-overlay-default text-text-tertiary">
            {repo}
          </span>
        )}
        <span className="font-mono text-xs text-text-secondary break-all">
          <span className="text-text-tertiary">{directory}</span>
          <span className="text-[var(--color-brand-300)]">{filename}</span>
        </span>
      </div>
      {file.purpose && (
        <p className="text-label text-text-tertiary mt-0.5 ml-[29px]">
          {file.purpose}
        </p>
      )}
    </div>
  );
}

interface KeyFilesSectionProps {
  files: InvestigationKeyFile[];
  defaultOpen?: boolean;
}

export function KeyFilesSection({ files, defaultOpen = false }: KeyFilesSectionProps) {
  if (files.length === 0) return null;

  const copyContent = "## Key files\n\n| File | Purpose |\n|------|---------|"
    + files.map((f) => `\n| \`${f.file}\` | ${f.purpose} |`).join("");

  return (
    <CollapsibleSection title="Key files" icon={FileCode} defaultOpen={defaultOpen} copyContent={copyContent}>
      <div className="space-y-0">
        {files.map((file) => (
          <FileRow key={file.file} file={file} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
