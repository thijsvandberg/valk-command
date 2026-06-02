import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { StoryVersion } from "@/types/ticket";
import { VersionPreview } from "./VersionPreview";

// Capture linkifyRefs so the call-site test can assert the flag is threaded.
// Pill rendering itself is covered by renderMarkdown.test.tsx.
vi.mock("./renderMarkdown", () => ({
  renderMarkdown: (content: string, opts?: { linkifyRefs?: boolean }) => (
    <span data-testid="markdown" data-linkify={opts?.linkifyRefs ? "true" : "false"}>{content}</span>
  ),
}));

vi.mock("@/hooks/usePrismLanguages", () => ({
  usePrismLanguages: vi.fn(),
}));

vi.mock("@/components/shared/VersionPicker", () => ({
  VersionPicker: () => <div data-testid="version-picker" />,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));

function makeVersion(overrides: Partial<StoryVersion> = {}): StoryVersion {
  return {
    versionNumber: 2,
    date: "2026-01-01T10:00:00Z",
    contentHash: "abc",
    content: "Compare with VPL-222",
    updatedBy: null,
    // No avatar so the next/image branch is skipped.
    updatedByAvatar: null,
    label: "current",
    ...overrides,
  };
}

describe("VersionPreview ticket-reference linkification", () => {
  it("linkifies ticket references in the version content (BRDG-253)", () => {
    render(
      <VersionPreview
        version={makeVersion()}
        versionOptions={[]}
        loadingContent={false}
        onVersionChange={vi.fn()}
        onBack={vi.fn()}
        onOpenDiff={vi.fn()}
      />
    );

    expect(screen.getByText("Compare with VPL-222")).toHaveAttribute("data-linkify", "true");
  });
});
