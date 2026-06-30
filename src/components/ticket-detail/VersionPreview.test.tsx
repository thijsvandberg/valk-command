import { render, screen, fireEvent } from "@testing-library/react";
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
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
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
        onRestore={vi.fn()}
        restoring={false}
      />
    );

    expect(screen.getByText("Compare with VPL-222")).toHaveAttribute("data-linkify", "true");
  });
});

describe("VersionPreview restore action (BRDG-440)", () => {
  it("renders a Restore button and calls onRestore with the version on click", () => {
    const onRestore = vi.fn();
    const version = makeVersion();
    render(
      <VersionPreview
        version={version}
        versionOptions={[]}
        loadingContent={false}
        onVersionChange={vi.fn()}
        onBack={vi.fn()}
        onOpenDiff={vi.fn()}
        onRestore={onRestore}
        restoring={false}
      />
    );

    fireEvent.click(screen.getByText("Restore this version"));
    expect(onRestore).toHaveBeenCalledWith(version);
  });

  it("hides the Restore button on the active local draft version", () => {
    render(
      <VersionPreview
        version={makeVersion({ label: "draft" })}
        versionOptions={[]}
        loadingContent={false}
        onVersionChange={vi.fn()}
        onBack={vi.fn()}
        onOpenDiff={vi.fn()}
        onRestore={vi.fn()}
        restoring={false}
      />
    );

    expect(screen.queryByText("Restore this version")).not.toBeInTheDocument();
  });

  it("disables the Restore button while content is still loading", () => {
    render(
      <VersionPreview
        version={makeVersion({ content: "" })}
        versionOptions={[]}
        loadingContent={true}
        onVersionChange={vi.fn()}
        onBack={vi.fn()}
        onOpenDiff={vi.fn()}
        onRestore={vi.fn()}
        restoring={false}
      />
    );

    expect(screen.getByText("Restore this version").closest("button")).toBeDisabled();
  });

  it("shows a busy label while restoring", () => {
    render(
      <VersionPreview
        version={makeVersion()}
        versionOptions={[]}
        loadingContent={false}
        onVersionChange={vi.fn()}
        onBack={vi.fn()}
        onOpenDiff={vi.fn()}
        onRestore={vi.fn()}
        restoring={true}
      />
    );

    expect(screen.getByText("Restoring...")).toBeInTheDocument();
  });
});
