import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StoryPreviewApp } from "./StoryPreviewApp";

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

import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

function makeWriterCtx(overrides = {}) {
  return {
    session: { localTitle: "Story title", localDraft: "Mentions VPL-321" },
    ticketData: null,
    ...overrides,
  };
}

function makePaneCtx(overrides = {}) {
  return {
    registerToolbar: vi.fn(),
    unregisterToolbar: vi.fn(),
    ...overrides,
  };
}

describe("StoryPreviewApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("linkifies ticket references in the story preview (BRDG-253)", () => {
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx());
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<StoryPreviewApp />);

    expect(screen.getByText("Mentions VPL-321")).toHaveAttribute("data-linkify", "true");
  });
});
