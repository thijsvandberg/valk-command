"use client";

import { useState } from "react";
import type { Attachment } from "@/types/ticket";
import { File, FileMinus, ChevronDown, ChevronUp } from "lucide-react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { SECTION_KEYS } from "@/lib/section-collapse-store";
import { ImageLightbox } from "@/components/shared/ImageLightbox";

// Collapse long attachment lists to the first row of the 3-column grid;
// reviewing a ticket shouldn't mean scrolling past 20+ thumbnails.
const COLLAPSED_COUNT = 3;

export function AttachmentsSection({ attachments }: { attachments: Attachment[] }) {
  const [expanded, setExpanded] = useState(false);

  if (attachments.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="Attachments" sectionKey={SECTION_KEYS.attachments}>
          <p className="mt-3 text-body-lg text-text-muted">No attachments</p>
        </SectionHeader>
      </div>
    );
  }

  const isCollapsible = attachments.length > COLLAPSED_COUNT;
  const visible = isCollapsible && !expanded ? attachments.slice(0, COLLAPSED_COUNT) : attachments;
  const hiddenCount = attachments.length - COLLAPSED_COUNT;

  return (
    <div className="mt-8">
      <SectionHeader title="Attachments" count={attachments.length} sectionKey={SECTION_KEYS.attachments}>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {visible.map((att) => (
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
      {isCollapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} strokeWidth={1.5} />
              Show less
            </>
          ) : (
            <>
              <ChevronDown size={14} strokeWidth={1.5} />
              Show all {attachments.length} ({hiddenCount} more)
            </>
          )}
        </button>
      )}
      </SectionHeader>
    </div>
  );
}
