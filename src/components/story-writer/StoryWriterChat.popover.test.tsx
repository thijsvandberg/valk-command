import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StoryWriterChat } from "./StoryWriterChat";

// Keep the REAL QuickActionsPopover (the subject under test), stub only the
// heavier sibling controls so the popover fill path is exercised end-to-end.
vi.mock("@/components/shared/chat-controls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shared/chat-controls")>();
  return {
    ...actual,
    ModelSelector: () => null,
    CodebaseToggle: () => null,
  };
});

vi.mock("swr", () => ({ default: vi.fn(() => ({ data: undefined })) }));
import useSWR from "swr";

vi.mock("@/components/story-writer/ChatMessageParts", () => ({
  ChatMessage: () => null,
  DraftCard: () => null,
  RelatedStoriesInline: () => null,
  formatDuration: (ms: number) => `${ms}ms`,
}));

vi.mock("@/components/shared/StreamingIndicator", () => ({
  StreamingIndicator: () => null,
}));

const PROMPTS = [
  { id: "p0", label: "Improve story", text: "Improve my story." },
  { id: "p1", label: "Add test scenarios", text: "Add test scenarios to this story." },
];

function renderChat(overrides: Partial<React.ComponentProps<typeof StoryWriterChat>> = {}) {
  const props: React.ComponentProps<typeof StoryWriterChat> = {
    messages: [],
    status: "ready",
    streamProgress: "",
    streamError: null,
    usage: null,
    lastResponseDurationMs: null,
    localDraft: null,
    codebaseResearch: false,
    onCodebaseResearchChange: vi.fn(),
    model: "claude-sonnet-4-6",
    onModelChange: vi.fn(),
    onSend: vi.fn().mockResolvedValue(true),
    messageDraftMap: {},
    draftContentMap: {},
    ...overrides,
  };
  return render(<StoryWriterChat {...props} />);
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollTo = vi.fn();
  vi.mocked(useSWR).mockReturnValue({ data: { prompts: { story: PROMPTS } } } as never);
});

afterEach(() => {
  vi.mocked(useSWR).mockImplementation(() => ({ data: undefined }) as never);
});

describe("StoryWriterChat quick-actions popover fill (BRDG-490 #9)", () => {
  it("fills the compose box when a popover action is selected (Review is popover-only, so unambiguous)", () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: "AI actions" }));
    // "Review Story" is a special action that lives only in the popover (not the
    // chip row), so selecting it exercises the fill path without chip ambiguity.
    fireEvent.click(screen.getByRole("button", { name: "Review Story" }));

    const input = screen.getByPlaceholderText("Describe what to improve...") as HTMLTextAreaElement;
    expect(input.value).toContain("Review this story");
  });

  it("sends immediately when the popover row's send-now button is used", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    renderChat({ onSend });

    fireEvent.click(screen.getByRole("button", { name: "AI actions" }));
    fireEvent.click(screen.getByRole("button", { name: 'Send "Improve story" now' }));

    expect(onSend).toHaveBeenCalledWith("Improve my story.");
  });

  it("does not throw when Find Related is selected without an onFindRelated handler (epic-writer shape)", () => {
    // Epic Writer historically passed no onFindRelated, so the special action
    // must degrade gracefully rather than filling a stale prompt or crashing.
    renderChat({ onFindRelated: undefined });

    fireEvent.click(screen.getByRole("button", { name: "AI actions" }));
    fireEvent.click(screen.getByRole("button", { name: /Find Related/ }));

    expect(screen.getByPlaceholderText("Describe what to improve...")).toHaveValue("");
  });
});
