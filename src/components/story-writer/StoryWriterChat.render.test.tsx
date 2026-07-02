import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message } from "@/types/chat";
import { StoryWriterChat } from "./StoryWriterChat";

vi.mock("swr", () => ({
  default: () => ({ data: undefined }),
}));

vi.mock("@/components/story-writer/ChatMessageParts", () => ({
  ChatMessage: ({ message }: { message: Message }) => (
    <div data-testid="chat-message">{message.content}</div>
  ),
  DraftCard: () => null,
  RelatedStoriesInline: () => null,
  formatDuration: (ms: number) => `${ms}ms`,
}));

vi.mock("@/components/shared/chat-controls", () => ({
  ModelSelector: () => null,
  CodebaseToggle: () => null,
  QuickActionsPopover: () => null,
}));

vi.mock("@/components/shared/StreamingIndicator", () => ({
  StreamingIndicator: () => <div data-testid="streaming-indicator" />,
}));

function makeMessage(overrides: Partial<Message> & { id: string }): Message {
  return {
    conversationId: "conv-1",
    role: "user",
    content: "Hello",
    timestamp: "2026-07-01T10:00:00.000Z",
    workspaceTaskId: null,
    status: "sent",
    ...overrides,
  };
}

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
  // jsdom has no Element.scrollTo; the auto-scroll effect calls it on mount.
  window.HTMLElement.prototype.scrollTo = vi.fn();
});

describe("StoryWriterChat failed-send surfaces (BRDG-459)", () => {
  it("shows the per-message friendly reason with retry and dismiss on a failed message", () => {
    const onRetry = vi.fn().mockResolvedValue(true);
    const onDismissFailed = vi.fn();
    renderChat({
      messages: [makeMessage({ id: "m1", status: "failed", errorMessage: "Cannot reach the workspace. Is it running?" })],
      onRetry,
      onDismissFailed,
    });

    expect(screen.getByText("Cannot reach the workspace. Is it running?")).toBeInTheDocument();
    expect(screen.getByText("Tap to retry")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss failed message" }));
    expect(onDismissFailed).toHaveBeenCalledWith("m1");

    fireEvent.click(screen.getByText("Tap to retry"));
    expect(onRetry).toHaveBeenCalledWith("m1");
  });

  it("falls back to generic copy when the failed message has no stored reason (e.g. after reload)", () => {
    renderChat({
      messages: [makeMessage({ id: "m1", status: "failed" })],
      onDismissFailed: vi.fn(),
    });

    expect(screen.getByText("Message could not be sent.")).toBeInTheDocument();
  });

  it("no longer renders the Clear failed messages row", () => {
    renderChat({
      messages: [makeMessage({ id: "m1", status: "failed", errorMessage: "Cannot reach the workspace. Is it running?" })],
      onDismissFailed: vi.fn(),
    });

    expect(screen.queryByText("Clear failed messages")).not.toBeInTheDocument();
  });

  it("does not render the banner for a send failure (streamError stays null)", () => {
    renderChat({
      messages: [makeMessage({ id: "m1", status: "failed", errorMessage: "Cannot reach the workspace. Is it running?" })],
      onDismissFailed: vi.fn(),
    });

    // The reason appears exactly once: on the message, not duplicated in a banner.
    expect(screen.getAllByText("Cannot reach the workspace. Is it running?")).toHaveLength(1);
  });

  it("still renders the banner for message-less errors via the streamError prop", () => {
    renderChat({ streamError: "The workspace took too long to respond" });

    expect(screen.getByText("The workspace took too long to respond")).toBeInTheDocument();
  });
});
