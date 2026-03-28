import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatLayout from "./ChatLayout";

const mockConversation = {
  id: "conv-1",
  title: "Test conversation",
  createdAt: "2026-03-28T10:00:00.000Z",
  updatedAt: "2026-03-28T10:00:00.000Z",
};

const mockMessages = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "Hello there",
    createdAt: "2026-03-28T10:00:00.000Z",
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    role: "assistant",
    content: "Hi! How can I help?",
    createdAt: "2026-03-28T10:00:01.000Z",
  },
];

function mockFetchSequence(responses: Array<{ ok: boolean; data?: unknown; status?: number }>) {
  const mocked = vi.spyOn(global, "fetch");
  for (const response of responses) {
    mocked.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.data,
    } as Response);
  }
  return mocked;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset scrollIntoView mock
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

  it("creates a new conversation and selects it", async () => {
    const newConv = { ...mockConversation, id: "conv-new", title: "New conversation" };

    mockFetchSequence([
      { ok: true, data: [] },
      { ok: true, data: newConv },
      { ok: true, data: [] },
    ]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("New conversation"));

    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeInTheDocument();
    });
  });

  it("shows messages when a conversation is selected", async () => {
    mockFetchSequence([
      { ok: true, data: [mockConversation] },
      { ok: true, data: mockMessages },
    ]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Test conversation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test conversation"));

    await waitFor(() => {
      expect(screen.getByText("Hello there")).toBeInTheDocument();
      expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
    });
  });

  it("sends a message and displays both user and assistant responses", async () => {
    const sentUserMsg = {
      id: "msg-3",
      conversationId: "conv-1",
      role: "user",
      content: "Test input",
      createdAt: "2026-03-28T10:02:00.000Z",
    };
    const sentAssistantMsg = {
      id: "msg-4",
      conversationId: "conv-1",
      role: "assistant",
      content: "Response",
      createdAt: "2026-03-28T10:02:01.000Z",
    };

    mockFetchSequence([
      { ok: true, data: [mockConversation] },
      { ok: true, data: [] },
      { ok: true, data: { userMessage: sentUserMsg, assistantMessage: sentAssistantMsg } },
    ]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Test conversation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test conversation"));

    await waitFor(() => {
      expect(screen.getByLabelText("Message input")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Message input");
    fireEvent.change(input, { target: { value: "Test input" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(screen.getByText("Response")).toBeInTheDocument();
    });
  });

  it("deletes a conversation and clears the active view", async () => {
    mockFetchSequence([
      { ok: true, data: [mockConversation] },
      { ok: true, data: mockMessages },
      { ok: true, data: { success: true } },
    ]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Test conversation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test conversation"));

    await waitFor(() => {
      expect(screen.getByText("Hello there")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete Test conversation"));

    await waitFor(() => {
      expect(screen.getByText("Select a conversation or start a new one.")).toBeInTheDocument();
    });
  });

  it("shows error when conversation load fails", async () => {
    mockFetchSequence([{ ok: false, status: 500 }]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load conversations")).toBeInTheDocument();
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

    // The overlay div sits before the sidebar
    const overlay = container.querySelector(".fixed.inset-0.z-30");
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);

    await waitFor(() => {
      expect(container.querySelector(".fixed.inset-0.z-30")).not.toBeInTheDocument();
    });
  });

  it("closes mobile sidebar and selects conversation when a conversation is clicked", async () => {
    mockFetchSequence([
      { ok: true, data: [mockConversation] },
      { ok: true, data: mockMessages },
    ]);

    const { container } = render(<ChatLayout />);

    fireEvent.click(screen.getByLabelText("Open conversations"));

    await waitFor(() => {
      expect(screen.getByText("Test conversation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test conversation"));

    await waitFor(() => {
      expect(container.querySelector(".fixed.inset-0.z-30")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Message input")).toBeInTheDocument();
    });
  });
});
