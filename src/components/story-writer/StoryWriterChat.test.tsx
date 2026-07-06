import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message } from "@/types/chat";

// The chat pulls quick-prompts via SWR; return nothing so the compose box renders
// with an empty prompt set and no network.
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));

// Stub the heavy chat children so this test isolates the compose/clear behaviour.
vi.mock("@/components/story-writer/ChatMessageParts", () => ({
  ChatMessage: ({ message }: { message: Message }) => <div data-testid="msg">{message.content}</div>,
  DraftCard: () => null,
  RelatedStoriesInline: () => null,
  formatDuration: () => "",
}));
vi.mock("@/components/shared/chat-controls", () => ({
  ModelSelector: () => <div />,
  CodebaseToggle: () => <div />,
  QuickActionsPopover: () => <div />,
}));
vi.mock("@/components/shared/StreamingIndicator", () => ({ StreamingIndicator: () => <div /> }));
vi.mock("@/hooks/useScrollOverflow", () => ({
  useScrollOverflow: () => ({ canScrollLeft: false, canScrollRight: false }),
  scrollFadeMask: () => "",
}));

import { StoryWriterChat } from "./StoryWriterChat";

function makeMessages(): Message[] {
  return [
    { id: "m1", role: "user", content: "hello", timestamp: "2026-07-06T00:00:00.000Z", status: "sent" },
    { id: "m2", role: "assistant", content: "hi there", timestamp: "2026-07-06T00:00:01.000Z", status: "sent" },
  ] as Message[];
}

function baseProps(overrides?: Partial<React.ComponentProps<typeof StoryWriterChat>>) {
  return {
    messages: makeMessages(),
    status: "ready" as const,
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
}

// jsdom doesn't implement Element.scrollTo; the chat auto-scrolls to bottom on mount.
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
});

describe("StoryWriterChat clear chat (BRDG-489)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function typeAndSubmit(text: string) {
    const textarea = screen.getByPlaceholderText(/describe what to improve/i);
    fireEvent.change(textarea, { target: { value: text } });
    fireEvent.keyDown(textarea, { key: "Enter" });
  }

  it("swallows a `/clear` command instead of sending it, and opens the confirmation", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const onClearChat = vi.fn();
    render(<StoryWriterChat {...baseProps({ onSend, onClearChat })} />);

    typeAndSubmit("/clear");

    // Never sent to the AI.
    expect(onSend).not.toHaveBeenCalled();
    // Confirmation appears; not cleared until confirmed.
    expect(await screen.findByText("Clear chat?")).toBeInTheDocument();
    expect(onClearChat).not.toHaveBeenCalled();
  });

  it("clears after confirming the dialog", async () => {
    const onClearChat = vi.fn();
    render(<StoryWriterChat {...baseProps({ onClearChat })} />);

    typeAndSubmit("/clear");
    fireEvent.click(await screen.findByRole("button", { name: /^clear chat$/i }));

    expect(onClearChat).toHaveBeenCalledTimes(1);
  });

  it("clears from the Clear button in the compose footer", async () => {
    const onClearChat = vi.fn();
    render(<StoryWriterChat {...baseProps({ onClearChat })} />);

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^clear chat$/i }));

    expect(onClearChat).toHaveBeenCalledTimes(1);
  });

  it("still swallows `/clear` (no send) even when clearing is unavailable", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<StoryWriterChat {...baseProps({ onSend, onClearChat: undefined })} />);

    typeAndSubmit("/clear");

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByText("Clear chat?")).not.toBeInTheDocument();
  });

  it("does not offer the Clear button when the chat is empty", () => {
    render(<StoryWriterChat {...baseProps({ messages: [], onClearChat: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: /^clear$/i })).not.toBeInTheDocument();
  });
});
