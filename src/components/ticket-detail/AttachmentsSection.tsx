"use client";

import Image from "next/image";
import type { Attachment } from "@/types/ticket";
import { File, FileMinus } from "lucide-react";
import { SectionHeader } from "@/components/shared/SectionHeader";

export function AttachmentsSection({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Attachments" />
        <p className="mt-3 text-sm text-white/25">No attachments</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <SectionHeader title="Attachments" count={attachments.length} />
      <div className="mt-3 grid grid-cols-3 gap-3">
        {attachments.map((att) => (
          <div
            key={att.id}
            className={`group relative overflow-hidden rounded-lg border ${
              att.cleaned
                ? "border-white/[0.04] bg-white/[0.01]"
                : "border-white/[0.06] bg-white/[0.03] cursor-pointer hover:border-white/[0.10] hover:bg-white/[0.04]"
            }`}
          >
            <div
              className="flex h-24 items-center justify-center overflow-hidden"
              style={att.cleaned ? {} : { backgroundColor: `${att.color}08` }}
            >
              {att.cleaned ? (
                <div className="flex flex-col items-center gap-1 text-white/15">
                  <FileMinus className="h-6 w-6" strokeWidth={1.5} />
                  <span className="text-[10px]">Cleaned</span>
                </div>
              ) : att.mimeType.startsWith("image/") ? (
                <Image
                  src={`/api/attachments/${att.id}`}
                  alt={att.filename}
                  width={300}
                  height={96}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1" style={{ color: att.color }}>
                  <File className="h-8 w-8 opacity-40" strokeWidth={1.5} />
                  <span className="text-[10px] font-medium opacity-60">
                    {att.mimeType.split("/")[1].toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="border-t border-white/[0.04] px-2.5 py-2">
              <div className="truncate text-xs text-white/50">{att.filename}</div>
              <div className="mt-0.5 text-[10px] text-white/25">
                {att.cleaned && att.cleanedAt
                  ? `Cleaned ${new Date(att.cleanedAt).toLocaleDateString()}`
                  : `${(att.size / 1000).toFixed(0)} KB`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
