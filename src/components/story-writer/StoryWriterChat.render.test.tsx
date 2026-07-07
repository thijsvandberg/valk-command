import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Message } from "@/types/chat";
import { StoryWriterChat } from "./StoryWriterChat";

vi.mock("swr", () => ({
  default: vi.fn(() => ({ data: undefined })),
}));

import useSWR from "swr";

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

describe("StoryWriterChat quick-prompt chip row (BRDG-460)", () => {
  const SIX_PROMPTS = [
    { id: "p0", label: "Improve story", text: "Improve my story." },
    { id: "p1", label: "Investigate", text: "Investigate this." },
    { id: "p2", label: "Make more concise", text: "Make it concise." },
    { id: "p3", label: "Add test scenarios", text: "Add tests." },
    { id: "p4", label: "Technical analysis", text: "Analyse." },
    { id: "p5", label: "Suggest title", text: "Suggest a title." },
  ];

  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: { prompts: { story: SIX_PROMPTS } },
    } as never);
  });

  afterEach(() => {
    vi.mocked(useSWR).mockImplementation(() => ({ data: undefined }) as never);
  });

  it("renders every configured prompt in one non-wrapping scrollable row", () => {
    renderChat();

    for (const p of SIX_PROMPTS) {
      expect(screen.getByRole("button", { name: p.label })).toBeInTheDocument();
    }
    const row = screen.getByTestId("quick-chip-row");
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).not.toContain("flex-wrap");
  });

  it("keeps the dual action: label fills the input, the send segment submits immediately", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    renderChat({ onSend });

    fireEvent.click(screen.getByRole("button", { name: "Improve story" }));
    expect(screen.getByPlaceholderText("Describe what to improve...")).toHaveValue(
      "Improve my story.",
    );

    // Direct send is blocked while the input holds text; clear it first.
    fireEvent.change(screen.getByPlaceholderText("Describe what to improve..."), {
      target: { value: "" },
    });
    const sendButtons = screen.getAllByTitle("Submit immediately");
    expect(sendButtons).toHaveLength(SIX_PROMPTS.length);
    fireEvent.click(sendButtons[1]);
    expect(onSend).toHaveBeenCalledWith("Investigate this.");
  });
});

describe("StoryWriterChat slash commands (BRDG-491 #3)", () => {
  it("surfaces the /clear command autocomplete when typing a slash", () => {
    renderChat({ onClearChat: vi.fn() });
    fireEvent.change(screen.getByPlaceholderText("Describe what to improve..."), {
      target: { value: "/" },
    });
    expect(screen.getByRole("listbox", { name: /commands/i })).toBeInTheDocument();
    expect(screen.getByText("/clear")).toBeInTheDocument();
  });

  it("completes the command when its suggestion is clicked", () => {
    renderChat({ onClearChat: vi.fn() });
    const input = screen.getByPlaceholderText("Describe what to improve...") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "/cl" } });
    fireEvent.click(screen.getByText("/clear"));
    expect(input.value).toBe("/clear");
  });

  it("shows no command menu without a clear handler", () => {
    renderChat();
    fireEvent.change(screen.getByPlaceholderText("Describe what to improve..."), {
      target: { value: "/" },
    });
    expect(screen.queryByRole("listbox", { name: /commands/i })).not.toBeInTheDocument();
  });

  it("runs /clear on submit, resolving a unique prefix", () => {
    renderChat({ onClearChat: vi.fn() });
    const input = screen.getByPlaceholderText("Describe what to improve...");
    fireEvent.change(input, { target: { value: "/cl" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // The clear-chat confirmation opens instead of sending "/cl" as a message.
    expect(screen.getByText("Clear chat?")).toBeInTheDocument();
  });
});
