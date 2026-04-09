"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { StoryDiffPanel } from "@/components/story-diff/StoryDiffPanel";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import type { StoryVersion } from "@/types/ticket";
import { useTicketVersions } from "@/hooks/useSprintBoard";

// Fallback sample data for when no ticket key is provided
const SAMPLE_VERSIONS: StoryVersion[] = [
  {
    versionNumber: 1,
    date: "2026-03-20T10:00:00Z",
    contentHash: "abc123",
    content: "## Description\n\nInitial version of the story.\n\n## Acceptance Criteria\n\n- [ ] First criterion",
    updatedBy: null,
    updatedByAvatar: null,
  },
  {
    versionNumber: 2,
    date: "2026-03-22T14:30:00Z",
    contentHash: "def456",
    content: "## Description\n\nUpdated version with more detail.\n\n## Acceptance Criteria\n\n- [ ] First criterion\n- [ ] Second criterion added",
    updatedBy: null,
    updatedByAvatar: null,
  },
];

function DiffPreviewContent() {
  const searchParams = useSearchParams();
  const ticketKey = searchParams.get("ticket");
  const [view, setView] = useState<"panel" | "raw">("panel");

  const { data: apiVersions } = useTicketVersions(ticketKey);

  const versions: StoryVersion[] = apiVersions && apiVersions.length > 0
    ? apiVersions.map((v: Record<string, unknown>, idx: number) => ({
        versionNumber: idx + 1,
        date: (v.createdAt as string) || new Date().toISOString(),
        contentHash: (v.contentHash as string) || "",
        content: (v.description as string) || "",
        updatedBy: (v.updatedBy as string) ?? null,
        updatedByAvatar: (v.updatedByAvatar as string) ?? null,
      }))
    : SAMPLE_VERSIONS;

  return (
    <div className="flex h-full flex-col">
      {/* View toggle */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-6 py-3">
        <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white mr-4">
          Diff Preview
        </h1>
        {ticketKey && (
          <span className="mr-2 font-mono text-xs text-[var(--color-brand-400)]">{ticketKey}</span>
        )}
        <button
          type="button"
          onClick={() => setView("panel")}
          className={`rounded-md px-3 py-1.5 text-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 ${
            view === "panel"
              ? "bg-white/[0.08] text-white"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
          style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
        >
          Panel View
        </button>
        <button
          type="button"
          onClick={() => setView("raw")}
          className={`rounded-md px-3 py-1.5 text-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 ${
            view === "raw"
              ? "bg-white/[0.08] text-white"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
          style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
        >
          Raw Diff
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === "panel" ? (
          <div className="mx-auto h-full max-w-2xl">
            <StoryDiffPanel
              versions={versions}
              onBack={() => {
                window.history.back();
              }}
            />
          </div>
        ) : versions.length >= 2 ? (
          <div className="mx-auto max-w-2xl overflow-y-auto p-6">
            <div className="mb-4">
              <p className="text-xs text-white/40 mb-2">
                Version {versions.length - 1} vs Version {versions.length} (raw diff)
              </p>
              <StoryDiff
                oldText={versions[versions.length - 2].content}
                newText={versions[versions.length - 1].content}
                oldLabel={`v${versions.length - 1}`}
                newLabel={`v${versions.length}`}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/30">Not enough versions to show a diff</p>
          </div>
        )}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default function DiffPreviewPage() {
  const pageTitle = usePageTitle("Diff Preview");
  return (
    <>
      {pageTitle}
      <Suspense fallback={<div className="flex h-full items-center justify-center"><span className="text-sm text-white/30">Loading...</span></div>}>
        <DiffPreviewContent />
      </Suspense>
    </>
  );
}
