"use client";

import type { Attachment } from "@/types/ticket";
import { File, FileMinus } from "lucide-react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { ImageLightbox } from "@/components/shared/ImageLightbox";

export function AttachmentsSection({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Attachments" />
        <p className="mt-3 text-body-lg text-text-muted">No attachments</p>
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
                ? "border-border-subtle bg-overlay-subtle"
                : "border-border-default bg-overlay-subtle cursor-pointer hover:border-border-strong hover:bg-hover-list-item"
            }`}
          >
            <div
              className="flex h-24 items-center justify-center overflow-hidden"
              style={att.cleaned ? {} : { backgroundColor: `${att.color}08` }}
            >
              {att.cleaned ? (
                <div className="flex flex-col items-center gap-1 text-text-muted">
                  <FileMinus className="h-6 w-6" strokeWidth={1.5} />
                  <span className="text-caption">Cleaned</span>
                </div>
              ) : att.mimeType.startsWith("image/") ? (
                <ImageLightbox
                  src={`/api/attachments/${att.id}`}
                  alt={att.filename}
                >
                  {/* Plain <img>, not next/image: the optimizer fetches the
                      cookie-protected /api/attachments route server-side
                      without the session cookie and gets a 401. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/attachments/${att.id}`}
                    alt={att.filename}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </ImageLightbox>
              ) : (
                <div className="flex flex-col items-center gap-1" style={{ color: att.color }}>
                  <File className="h-8 w-8 opacity-40" strokeWidth={1.5} />
                  <span className="text-caption font-medium opacity-60">
                    {att.mimeType.split("/")[1].toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="border-t border-border-subtle px-2.5 py-2">
              <div className="truncate text-body-sm text-text-secondary">{att.filename}</div>
              <div className="mt-0.5 text-caption text-text-muted">
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
