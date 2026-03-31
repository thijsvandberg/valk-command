"use client";

import { useState } from "react";
import { StoryDiffPanel } from "@/components/story-diff/StoryDiffPanel";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import { MOCK_VERSIONS } from "@/components/story-diff/mock-versions";

export default function DiffPreviewPage() {
  const [view, setView] = useState<"panel" | "raw">("panel");

  return (
    <div className="flex h-full flex-col">
      {/* View toggle */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-6 py-3">
        <h1 className="font-[var(--font-display)] text-base font-semibold text-white mr-4">
          Diff Preview
        </h1>
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
              versions={MOCK_VERSIONS}
              onBack={() => {
                window.history.back();
              }}
            />
          </div>
        ) : (
          <div className="mx-auto max-w-2xl overflow-y-auto p-6">
            <div className="mb-4">
              <p className="text-xs text-white/40 mb-2">
                Version 3 vs Version 4 (raw diff)
              </p>
              <StoryDiff
                oldText={MOCK_VERSIONS[2].content}
                newText={MOCK_VERSIONS[3].content}
                oldLabel="v3 (Local edit)"
                newLabel="v4 (Jira sync)"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
