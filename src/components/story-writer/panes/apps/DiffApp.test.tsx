import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiffApp } from "./DiffApp";

vi.mock("../WriterContext", () => ({
  useWriterContext: vi.fn(),
}));

vi.mock("../PaneContext", () => ({
  usePaneContext: vi.fn(),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketVersions: vi.fn(),
}));

vi.mock("@/components/story-writer/DiffPane", () => ({
  DiffPane: ({
    baseSnapshot,
    rightVersions,
    diffViewMode,
  }: {
    baseSnapshot: string;
    rightVersions: unknown[];
    diffViewMode: string;
  }) => (
    <div
      data-testid="diff-pane"
      data-snapshot={baseSnapshot}
      data-version-count={rightVersions.length}
      data-view-mode={diffViewMode}
    />
  ),
}));

vi.mock("@/components/shared/VersionPicker", () => ({
  VersionPicker: ({ selectedId }: { selectedId: string }) => (
    <div data-testid="version-picker" data-selected={selectedId} />
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";
import { useTicketVersions } from "@/hooks/useSprintBoard";

function makeWriterCtx(overrides = {}) {
  return {
    ticketKey: "VPL-1",
    session: { id: "s1", localDraft: "current draft", localTitle: "Test" },
    aiDrafts: [],
    baseDescription: "",
    onDraftChange: vi.fn(),
    onDismissDraft: vi.fn(),
    ...overrides,
  };
}

function makePaneCtx(overrides = {}) {
  return {
    registerToolbar: vi.fn(),
    unregisterToolbar: vi.fn(),
    pendingDiffDraftId: null,
    consumePendingDiffDraftId: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe("DiffApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useTicketVersions as ReturnType<typeof vi.fn>).mockReturnValue({ data: null });
  });

  it("renders DiffPane", () => {
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx());
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<DiffApp />);

    expect(screen.getByTestId("diff-pane")).toBeInTheDocument();
  });

  it("passes baseSnapshot from session localDraft", () => {
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(
      makeWriterCtx({ session: { id: "s1", localDraft: "snapshot text", localTitle: "" } })
    );
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<DiffApp />);

    expect(screen.getByTestId("diff-pane")).toHaveAttribute("data-snapshot", "snapshot text");
  });

  it("builds rightVersions from AI drafts", () => {
    const aiDrafts = [
      { id: "d1", draftIndex: 0, content: "AI draft 1", createdAt: new Date().toISOString() },
      { id: "d2", draftIndex: 1, content: "AI draft 2", createdAt: new Date().toISOString() },
    ];
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(
      makeWriterCtx({ aiDrafts })
    );
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<DiffApp />);

    expect(screen.getByTestId("diff-pane")).toHaveAttribute("data-version-count", "2");
  });

  it("builds rightVersions from stored ticket versions", () => {
    const storedVersions = [
      { id: "v1", description: "Version 1", createdAt: "2024-01-01T00:00:00Z", updatedBy: "User", updatedByAvatar: null, contentHash: "abc" },
      { id: "v2", description: "Version 2", createdAt: "2024-01-02T00:00:00Z", updatedBy: "User", updatedByAvatar: null, contentHash: "def" },
    ];
    (useTicketVersions as ReturnType<typeof vi.fn>).mockReturnValue({ data: storedVersions });
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx());
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<DiffApp />);

    // 2 stored versions should appear in rightVersions
    expect(screen.getByTestId("diff-pane")).toHaveAttribute("data-version-count", "2");
  });

  it("registers toolbar on mount with 'Diff' label", () => {
    const registerToolbar = vi.fn();
    const unregisterToolbar = vi.fn();
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx());
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(
      makePaneCtx({ registerToolbar, unregisterToolbar })
    );

    const { unmount } = render(<DiffApp />);

    expect(registerToolbar).toHaveBeenCalledWith("diff", expect.objectContaining({ label: "Diff" }));

    unmount();

    expect(unregisterToolbar).toHaveBeenCalledWith("diff");
  });

  it("consumes pendingDiffDraftId on mount when set", () => {
    const consumePendingDiffDraftId = vi.fn().mockReturnValue("draft-id-xyz");
    const aiDrafts = [
      { id: "draft-id-xyz", draftIndex: 0, content: "pending draft", createdAt: new Date().toISOString() },
    ];
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx({ aiDrafts }));
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(
      makePaneCtx({ pendingDiffDraftId: "draft-id-xyz", consumePendingDiffDraftId })
    );

    render(<DiffApp />);

    expect(consumePendingDiffDraftId).toHaveBeenCalled();
  });

  it("defaults to plain view mode", () => {
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx());
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<DiffApp />);

    expect(screen.getByTestId("diff-pane")).toHaveAttribute("data-view-mode", "plain");
  });
});
