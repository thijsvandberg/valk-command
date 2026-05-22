import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatLayout from "./ChatLayout";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/hooks/useWorkspaceTask", () => ({
  useWorkspaceTask: () => ({
    status: "idle" as const,
    skill: null,
    taskId: null,
    progressText: null,
    toolCalls: [],
    output: null,
    error: null,
    submitAndStream: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("@/hooks/useWorkspaceHealth", () => ({
  useWorkspaceHealth: () => ({
    workspace: "connected" as const,
    claude: "valid" as const,
    tokenExpiresAt: null,
  }),
}));

vi.mock("@/lib/prefetch", () => ({
  prefetchConversation: vi.fn(),
  cancelAllPrefetches: vi.fn(),
}));

const mockConversation = {
  id: "conv-1",
  title: "Test conversation",
  createdAt: "2026-03-28T10:00:00.000Z",
  relatedTicket: null,
  metadata: null,
};

const mockMessages = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "Hello there",
    timestamp: "2026-03-28T10:00:00.000Z",
    workspaceTaskId: null,
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    role: "assistant",
    content: "Hi! How can I help?",
    timestamp: "2026-03-28T10:00:01.000Z",
    workspaceTaskId: null,
  },
];

function mockFetchSequence(responses: Array<{ ok: boolean; data?: unknown; status?: number }>) {
  const queue = [...responses];
  const mocked = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    // Running tasks poll should always return empty so it doesn't consume sequenced responses
    if (url.includes("workspace-tasks?status=running")) {
      return { ok: true, status: 200, json: async () => [] } as Response;
    }
    const response = queue.shift();
    if (!response) return { ok: true, status: 200, json: async () => null } as Response;
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.data,
    } as Response;
  });
  return mocked;
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockPush.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ChatLayout", () => {
  it("shows empty state when no conversations exist", async () => {
    mockFetchSequence([{ ok: true, data: [] }]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
    expect(screen.getByText("Select a conversation or start a new one.")).toBeInTheDocument();
  });

  it("loads and displays conversation list", async () => {
    mockFetchSequence([{ ok: true, data: [mockConversation] }]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Test conversation")).toBeInTheDocument();
    });
  });

  it("creates a new conversation and navigates to it", async () => {
    const newConv = { ...mockConversation, id: "conv-new", title: "New conversation" };

    mockFetchSequence([
      { ok: true, data: [] },
      { ok: true, data: newConv },
    ]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("New conversation"));
    fireEvent.click(screen.getByText("Chat"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat/conv-new");
    });
  });

  it("shows messages when rendered with a conversationId", async () => {
    mockFetchSequence([
      { ok: true, data: [mockConversation] },
      { ok: true, data: { ...mockConversation, messages: mockMessages } },
    ]);

    render(<ChatLayout conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Hello there")).toBeInTheDocument();
      expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
    });
  });

  it("sends a message and displays the saved response", async () => {
    const savedMsg = {
      id: "msg-3",
      conversationId: "conv-1",
      role: "user",
      content: "Test input",
      timestamp: "2026-03-28T10:02:00.000Z",
      workspaceTaskId: null,
    };

    mockFetchSequence([
      { ok: true, data: [mockConversation] },
      { ok: true, data: { ...mockConversation, messages: [] } },
      { ok: true, data: savedMsg },
    ]);

    render(<ChatLayout conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Message input");
    fireEvent.change(input, { target: { value: "Test input" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(screen.getByText("Test input")).toBeInTheDocument();
    });
  });

  it("deletes the active conversation and navigates to /chat", async () => {
    mockFetchSequence([
      { ok: true, data: [mockConversation] },
      { ok: true, data: { ...mockConversation, messages: mockMessages } },
      { ok: true, status: 204, data: null },
    ]);

    render(<ChatLayout conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getAllByText("Test conversation").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByLabelText("Delete Test conversation"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat");
    });
  });

  it("navigates to conversation URL when clicking a conversation", async () => {
    mockFetchSequence([{ ok: true, data: [mockConversation] }]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Test conversation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test conversation"));

    expect(mockPush).toHaveBeenCalledWith("/chat/conv-1");
  });

  it("shows error when conversation load fails", async () => {
    mockFetchSequence([{ ok: false, status: 500 }]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Request failed (500)")).toBeInTheDocument();
    });
  });

  it("renders mobile sidebar toggle button", async () => {
    mockFetchSequence([{ ok: true, data: [] }]);

    render(<ChatLayout />);

    expect(screen.getByLabelText("Open conversations")).toBeInTheDocument();
  });

  it("shows overlay and close button when mobile sidebar is opened", async () => {
    mockFetchSequence([{ ok: true, data: [] }]);

    render(<ChatLayout />);

    fireEvent.click(screen.getByLabelText("Open conversations"));

    expect(screen.getByLabelText("Close conversations")).toBeInTheDocument();
    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
  });

  it("closes mobile sidebar when overlay is clicked", async () => {
    mockFetchSequence([{ ok: true, data: [] }]);

    const { container } = render(<ChatLayout />);

    fireEvent.click(screen.getByLabelText("Open conversations"));

    const overlay = container.querySelector(".fixed.inset-0.z-30");
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);

    await waitFor(() => {
      expect(container.querySelector(".fixed.inset-0.z-30")).not.toBeInTheDocument();
    });
  });
});
