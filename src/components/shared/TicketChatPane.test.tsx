import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketChatPane } from "./TicketChatPane";

vi.mock("lucide-react", () => ({
  MessageSquareText: (props: Record<string, unknown>) => <span data-testid="msg-icon" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="x-icon" {...props} />,
  Sparkles: (props: Record<string, unknown>) => <span data-testid="sparkles" {...props} />,
  Send: (props: Record<string, unknown>) => <span data-testid="send" {...props} />,
  Paperclip: (props: Record<string, unknown>) => <span data-testid="paperclip" {...props} />,
  AtSign: (props: Record<string, unknown>) => <span data-testid="at-sign" {...props} />,
}));

const mockSendMessage = vi.fn().mockResolvedValue(true);
const mockRefresh = vi.fn();

vi.mock("@/hooks/useMessages", () => ({
  useMessages: () => ({
    messages: [
      { id: "msg-1", role: "user", content: "Hello", timestamp: "2026-01-01T10:00:00Z" },
      { id: "msg-2", role: "assistant", content: "Hi there", timestamp: "2026-01-01T10:00:01Z" },
    ],
    loading: false,
    sendMessage: mockSendMessage,
    refresh: mockRefresh,
  }),
}));

vi.mock("@/hooks/useWorkspaceTask", () => ({
  useWorkspaceTask: () => ({
    status: "idle",
    skill: null,
    taskId: null,
    progressText: null,
    toolCalls: [],
    output: null,
    error: null,
    submitAndStream: vi.fn(),
    streamExistingTask: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ id: "conv-1", ticketContext: "context data" }),
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (text: string) => [<span key="md">{text}</span>],
}));

vi.mock("@/components/shared/ChatBubble", () => ({
  ChatBubble: ({ children }: { children: React.ReactNode }) => <div data-testid="chat-bubble">{children}</div>,
}));

vi.mock("@/components/shared/ChatInput", () => ({
  ChatInput: ({ onSend, placeholder }: { onSend: (msg: string) => Promise<boolean>; placeholder: string }) => (
    <div>
      <input data-testid="chat-input" placeholder={placeholder} />
      <button data-testid="chat-send" onClick={() => onSend("test message")}>Send</button>
    </div>
  ),
}));

vi.mock("@/components/shared/LoadingState", () => ({
  LoadingState: ({ label }: { label: string }) => <div data-testid="loading">{label}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TicketChatPane", () => {
  it("renders a clean Chat header without redundant key/title", async () => {
    render(<TicketChatPane ticketKey="PROJ-123" />);
    await waitFor(() => {
      expect(screen.getByText("Chat")).toBeInTheDocument();
    });
    // Key/title are already shown on the page, so they are not repeated here.
    expect(screen.queryByText("PROJ-123")).not.toBeInTheDocument();
  });

  it("renders messages as chat bubbles", async () => {
    render(<TicketChatPane ticketKey="PROJ-123" />);
    await waitFor(() => {
      expect(screen.getAllByTestId("chat-bubble")).toHaveLength(2);
    });
  });

  it("renders chat input", async () => {
    render(<TicketChatPane ticketKey="PROJ-123" />);
    await waitFor(() => {
      expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    });
  });

  it("renders close button when onClose provided", async () => {
    const onClose = vi.fn();
    render(<TicketChatPane ticketKey="PROJ-123" onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Close chat")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Close chat"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not render close button when onClose not provided", async () => {
    render(<TicketChatPane ticketKey="PROJ-123" />);
    await waitFor(() => {
      expect(screen.getByText("Chat")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Close chat")).not.toBeInTheDocument();
  });
});
