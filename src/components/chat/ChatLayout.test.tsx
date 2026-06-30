import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { SWRConfig } from "swr";
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
  pinned: false,
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

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

interface ChatFetchOptions {
  conversations?: unknown; // GET /api/conversations
  conversationsStatus?: number; // GET /api/conversations failure status
  detail?: unknown; // GET /api/conversations/:id
  created?: unknown; // POST /api/conversations
  saved?: unknown; // POST /api/conversations/:id/messages
}

// Route by URL + method so the assertions no longer depend on the order in which
// SWR happens to fire the conversation-list vs conversation-detail fetches.
function setupFetch(opts: ChatFetchOptions = {}) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("workspace-tasks?status=running")) return ok([]);

    if (url.endsWith("/api/conversations") && method === "POST") return ok(opts.created ?? null);
    if (url.endsWith("/api/conversations")) {
      if (opts.conversationsStatus && opts.conversationsStatus >= 400) {
        return { ok: false, status: opts.conversationsStatus, json: async () => { throw new Error("no json"); } } as unknown as Response;
      }
      return ok(opts.conversations ?? []);
    }

    if (/\/api\/conversations\/[^/]+\/messages$/.test(url) && method === "POST") return ok(opts.saved ?? null);
    if (/\/api\/conversations\/[^/]+$/.test(url) && method === "DELETE") {
      return { ok: true, status: 204, json: async () => null } as Response;
    }
    if (/\/api\/conversations\/[^/]+$/.test(url)) return ok(opts.detail ?? null);

    return ok(null);
  });
}

// Fresh SWR cache per render so a key populated by one test cannot leak into the next.
function renderChat(ui: React.ReactElement) {
  return render(
    React.createElement(
      SWRConfig,
      { value: { provider: () => new Map(), dedupingInterval: 0 } },
      ui,
    ),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockPush.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ChatLayout", () => {
  it("shows empty state when no conversations exist", async () => {
    setupFetch({ conversations: [] });

    renderChat(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
    expect(screen.getByText("Select a conversation or start a new one.")).toBeInTheDocument();
  });

  it("loads and displays conversation list", async () => {
    setupFetch({ conversations: [mockConversation] });

    renderChat(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Test conversation")).toBeInTheDocument();
    });
  });

  it("creates a new conversation and navigates to it", async () => {
    const newConv = { ...mockConversation, id: "conv-new", title: "New conversation" };

    setupFetch({ conversations: [], created: newConv });

    renderChat(<ChatLayout />);

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
    setupFetch({
      conversations: [mockConversation],
      detail: { ...mockConversation, messages: mockMessages },
    });

    renderChat(<ChatLayout conversationId="conv-1" />);

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

    setupFetch({
      conversations: [mockConversation],
      detail: { ...mockConversation, messages: [] },
      saved: savedMsg,
    });

    renderChat(<ChatLayout conversationId="conv-1" />);

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
    setupFetch({
      conversations: [mockConversation],
      detail: { ...mockConversation, messages: mockMessages },
    });

    renderChat(<ChatLayout conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getAllByText("Test conversation").length).toBeGreaterThan(0);
    });

    // Open overflow menu and click delete
    fireEvent.click(screen.getByLabelText("Actions for Test conversation"));
    fireEvent.click(screen.getByTestId("overflow-delete"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat");
    });
  });

  it("navigates to conversation URL when clicking a conversation", async () => {
    setupFetch({ conversations: [mockConversation] });

    renderChat(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Test conversation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test conversation"));

    expect(mockPush).toHaveBeenCalledWith("/chat/conv-1");
  });

  it("shows error when conversation load fails", async () => {
    setupFetch({ conversationsStatus: 500 });

    renderChat(<ChatLayout />);

    await waitFor(() => {
      expect(screen.getByText("Request failed (500)")).toBeInTheDocument();
    });
  });

  it("renders mobile sidebar toggle button", async () => {
    setupFetch({ conversations: [] });

    renderChat(<ChatLayout />);

    expect(screen.getByLabelText("Open conversations")).toBeInTheDocument();
  });

  it("shows overlay and close button when mobile sidebar is opened", async () => {
    setupFetch({ conversations: [] });

    renderChat(<ChatLayout />);

    fireEvent.click(screen.getByLabelText("Open conversations"));

    expect(screen.getByLabelText("Close conversations")).toBeInTheDocument();
    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
  });

  it("closes mobile sidebar when overlay is clicked", async () => {
    setupFetch({ conversations: [] });

    const { container } = renderChat(<ChatLayout />);

    fireEvent.click(screen.getByLabelText("Open conversations"));

    const overlay = container.querySelector(".fixed.inset-0.z-30");
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);

    await waitFor(() => {
      expect(container.querySelector(".fixed.inset-0.z-30")).not.toBeInTheDocument();
    });
  });
});
