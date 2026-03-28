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
      expect(screen.getAllByText("No conversations yet").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Select a conversation or start a new one.")).toBeInTheDocument();
  });

  it("loads and displays conversation list", async () => {
    mockFetchSequence([{ ok: true, data: [mockConversation] }]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getAllByText("Test conversation").length).toBeGreaterThan(0);
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
      expect(screen.getAllByText("No conversations yet").length).toBeGreaterThan(0);
    });

    const createButtons = screen.getAllByLabelText("New conversation");
    fireEvent.click(createButtons[0]);

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
      expect(screen.getAllByText("Test conversation").length).toBeGreaterThan(0);
    });

    const convButtons = screen.getAllByText("Test conversation");
    fireEvent.click(convButtons[0]);

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
      expect(screen.getAllByText("Test conversation").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("Test conversation")[0]);

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
      expect(screen.getAllByText("Test conversation").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("Test conversation")[0]);

    await waitFor(() => {
      expect(screen.getByText("Hello there")).toBeInTheDocument();
    });

    const deleteButton = screen.getAllByLabelText("Delete Test conversation")[0];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText("Select a conversation or start a new one.")).toBeInTheDocument();
    });
  });

  it("shows error when conversation load fails", async () => {
    mockFetchSequence([{ ok: false, status: 500 }]);

    render(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getAllByText("Failed to load conversations").length).toBeGreaterThan(0);
    });
  });
});
