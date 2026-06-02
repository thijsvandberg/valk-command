import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DraftPreviewApp } from "./DraftPreviewApp";

vi.mock("../WriterContext", () => ({
  useWriterContext: vi.fn(),
}));

vi.mock("../PaneContext", () => ({
  usePaneContext: vi.fn(),
}));

// Capture linkifyRefs so the call-site test can assert the flag is threaded.
// Pill rendering itself is covered by renderMarkdown.test.tsx.
vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (content: string, opts?: { linkifyRefs?: boolean }) => (
    <span data-testid="markdown" data-linkify={opts?.linkifyRefs ? "true" : "false"}>{content}</span>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

function makeWriterCtx(overrides = {}) {
  return {
    onAcceptDraft: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makePaneCtx(overrides = {}) {
  return {
    draftPreviewContent: { content: "Refs VPL-654", draftId: null, label: "Draft" },
    paneCount: 2,
    openApp: vi.fn(),
    closeApp: vi.fn(),
    registerToolbar: vi.fn(),
    unregisterToolbar: vi.fn(),
    ...overrides,
  };
}

describe("DraftPreviewApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("linkifies ticket references in the draft preview (BRDG-253)", () => {
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx());
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<DraftPreviewApp />);

    expect(screen.getByText("Refs VPL-654")).toHaveAttribute("data-linkify", "true");
  });
});
