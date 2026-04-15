"use client";

import { useState, useCallback } from "react";
import { Copy, FileText, Check } from "lucide-react";
import { copyAsMarkdown, copyAsRTF } from "@/lib/clipboard";

interface CopyActionsProps {
  content: string;
  className?: string;
  label?: string;
}

export function CopyActions({ content, className, label }: CopyActionsProps) {
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedRtf, setCopiedRtf] = useState(false);

  const handleCopyMd = useCallback(async () => {
    const ok = await copyAsMarkdown(content);
    if (ok) {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    }
  }, [content]);

  const handleCopyRtf = useCallback(async () => {
    const ok = await copyAsRTF(content);
    if (ok) {
      setCopiedRtf(true);
      setTimeout(() => setCopiedRtf(false), 2000);
    }
  }, [content]);

  return (
    <div className={`flex items-center gap-1 ${className ?? "mt-2 pt-2 border-t border-white/[0.04]"}`}>
      {label && <span className="text-[10px] text-white/20 mr-1">{label}</span>}
      <button
        type="button"
        onClick={handleCopyMd}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/30 cursor-pointer hover:text-white/50 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors duration-100"
        title="Copy as Markdown"
      >
        {copiedMd ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
        <span>{copiedMd ? "Copied" : "Markdown"}</span>
      </button>
      <button
        type="button"
        onClick={handleCopyRtf}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white/30 cursor-pointer hover:text-white/50 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors duration-100"
        title="Copy as formatted text"
      >
        {copiedRtf ? <Check size={11} strokeWidth={2} /> : <FileText size={11} strokeWidth={1.5} />}
        <span>{copiedRtf ? "Copied" : "Rich text"}</span>
      </button>
    </div>
  );
}
