import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BulkSuggestPanel } from "./BulkSuggestPanel";
import type { Message } from "@/types/chat";

function makeMessage(id: string, content: string): Message {
  return {
    id,
    role: "assistant",
    content,
    timestamp: new Date().toISOString(),
    conversationId: "conv-1",
    workspaceTaskId: null,
  };
}

const mockUseMessages = vi.fn();

vi.mock("@/hooks/useMessages", () => ({
  useMessages: (...args: unknown[]) => mockUseMessages(...args),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("BulkSuggestPanel", () => {
  beforeEach(() => {
    mockUseMessages.mockReturnValue({ messages: [] });
  });

  it("renders the panel container", () => {
    render(
      <BulkSuggestPanel
        conversationId="conv-1"
        isRunning={false}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByText("Subtask suggestions")).toBeInTheDocument();
  });

  it("calls onToggleCollapse when header is clicked", () => {
    const onToggleCollapse = vi.fn();
    render(
      <BulkSuggestPanel
        conversationId="conv-1"
        isRunning={false}
        collapsed={false}
        onToggleCollapse={onToggleCollapse}
      />,
    );
    const header = screen.getByRole("button");
    header.click();
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it("shows running state label while isRunning is true", () => {
    mockUseMessages.mockReturnValue({ messages: [] });
    render(
      <BulkSuggestPanel
        conversationId="conv-1"
        isRunning={true}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    // Running label includes a progress fraction
    expect(screen.getByText(/Generating subtasks/)).toBeInTheDocument();
  });

  it("hides body content when collapsed", () => {
    mockUseMessages.mockReturnValue({ messages: [] });
    render(
      <BulkSuggestPanel
        conversationId="conv-1"
        isRunning={false}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />,
    );
    // The background info and list container should not be present
    expect(screen.queryByText("This runs in the background.")).not.toBeInTheDocument();
  });

  it("shows Starting... spinner when running with no entries yet", () => {
    mockUseMessages.mockReturnValue({ messages: [] });
    render(
      <BulkSuggestPanel
        conversationId="conv-1"
        isRunning={true}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByText("Starting...")).toBeInTheDocument();
  });

  it("shows background info banner while running", () => {
    mockUseMessages.mockReturnValue({ messages: [] });
    render(
      <BulkSuggestPanel
        conversationId="conv-1"
        isRunning={true}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByText(/This runs in the background/)).toBeInTheDocument();
  });

  it("passes conversationId to useMessages", () => {
    render(
      <BulkSuggestPanel
        conversationId="conv-abc"
        isRunning={false}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(mockUseMessages).toHaveBeenCalledWith("conv-abc", expect.objectContaining({ hasRunningTask: false }));
  });
});
