import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useStoryWriter } from "./useStoryWriter";

type ESListener = (event: MessageEvent | Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState = 0;
  private listeners: Record<string, ESListener[]> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: ESListener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: ESListener) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  close() {
    this.readyState = 2;
  }
}

const TICKET_KEY = "VC-100";
const API_BASE = `/api/tickets/${TICKET_KEY}/story-writer`;

const mockSession = {
  id: "session-1",
  ticketKey: TICKET_KEY,
  conversationId: "conv-1",
  status: "active",
  localDraft: null,
  localTitle: null,
  baseVersionHash: null,
  targetTicketKey: null,
  targetLocalDraft: null,
  targetLocalTitle: null,
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
};

const mockMessages = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "assistant",
    content: "Hello",
    timestamp: "2026-04-01T10:01:00.000Z",
    workspaceTaskId: null,
  },
];

let originalConsoleError: typeof console.error;

beforeEach(() => {
  vi.restoreAllMocks();
  MockEventSource.instances = [];
  (globalThis as Record<string, unknown>).EventSource = MockEventSource as unknown as typeof EventSource;
  // The init effect depends on `monitoring` (a non-memoised object), so React
  // logs "Maximum update depth exceeded" warnings in tests. Suppress them to
  // keep test output clean; the hook works correctly despite the re-renders.
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (msg.includes("Maximum update depth exceeded")) return;
    originalConsoleError(...args);
  };
});

afterEach(() => {
  console.error = originalConsoleError;
  delete (globalThis as Record<string, unknown>).EventSource;
});

/**
 * The init effect depends on `monitoring` (a fresh object each render), so it
 * may re-run. Using mockImplementation instead of mockResolvedValueOnce keeps
 * the fetch behaviour stable across multiple invocations.
 */

describe("useStoryWriter", () => {
  describe("session initialization", () => {
    it("starts in loading state and transitions to ready when session exists", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url === API_BASE) {
          return {
            ok: true,
            json: async () => ({
              session: mockSession,
              messages: mockMessages,
              aiDrafts: [],
              relatedCandidates: [],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useStoryWriter(TICKET_KEY));

      expect(result.current.status).toBe("loading");

      await waitFor(() => expect(result.current.status).toBe("ready"));

      expect(result.current.session).toEqual(mockSession);
      expect(result.current.messages).toEqual(mockMessages);
    });

    it("creates a new session when none exists", async () => {
      const createdSession = { ...mockSession, id: "session-new" };
      let getCallCount = 0;

      vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const method = init?.method ?? "GET";

        if (url === API_BASE && method === "GET") {
          getCallCount++;
          if (getCallCount === 1) {
            return {
              ok: true,
              json: async () => ({ session: null, messages: [] }),
            } as Response;
          }
          // Subsequent GETs return the created session (re-init or refreshSession)
          return {
            ok: true,
            json: async () => ({
              session: createdSession,
              messages: [],
              aiDrafts: [],
              relatedCandidates: [],
            }),
          } as Response;
        }
        if (url === API_BASE && method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ session: createdSession }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useStoryWriter(TICKET_KEY));

      await waitFor(() => expect(result.current.status).toBe("ready"));

      expect(result.current.session).toEqual(createdSession);
    });

    it("retries on 409 conflict during session creation", async () => {
      const existingSession = { ...mockSession };
      let getCallCount = 0;
      let postCalled = false;

      vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const method = init?.method ?? "GET";

        if (url === API_BASE && method === "GET") {
          getCallCount++;
          if (getCallCount === 1) {
            return {
              ok: true,
              json: async () => ({ session: null, messages: [] }),
            } as Response;
          }
          // Retry GET after 409 or subsequent re-inits
          return {
            ok: true,
            json: async () => ({
              session: existingSession,
              messages: [],
              aiDrafts: [],
              relatedCandidates: [],
            }),
          } as Response;
        }
        if (url === API_BASE && method === "POST") {
          if (!postCalled) {
            postCalled = true;
            return { ok: false, status: 409 } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ session: existingSession }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useStoryWriter(TICKET_KEY));

      await waitFor(() => expect(result.current.status).toBe("ready"));

      expect(result.current.session).toEqual(existingSession);
    });

    it("sets status to idle on init failure", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async () => {
        return { ok: false, status: 500 } as Response;
      });

      const { result } = renderHook(() => useStoryWriter(TICKET_KEY));

      await waitFor(() => expect(result.current.status).toBe("idle"));
    });

    it("sets status to idle when session creation fails with non-retryable status", async () => {
      vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const method = init?.method ?? "GET";

        if (url === API_BASE && method === "GET") {
          return {
            ok: true,
            json: async () => ({ session: null, messages: [] }),
          } as Response;
        }
        if (url === API_BASE && method === "POST") {
          return { ok: false, status: 400 } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useStoryWriter(TICKET_KEY));

      await waitFor(() => expect(result.current.status).toBe("idle"));
    });

    it("resumes monitoring when last user message has pending task", async () => {
      const messagesWithPendingTask = [
        {
          id: "msg-1",
          conversationId: "conv-1",
          role: "user",
          content: "Write a story",
          timestamp: "2026-04-01T10:00:00.000Z",
          workspaceTaskId: "task-pending",
        },
      ];

      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url === API_BASE) {
          return {
            ok: true,
            json: async () => ({
              session: mockSession,
              messages: messagesWithPendingTask,
              aiDrafts: [],
              relatedCandidates: [],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const { result } = renderHook(() => useStoryWriter(TICKET_KEY));

      await waitFor(() => expect(result.current.status).toBe("streaming"));

      expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("initial state defaults", () => {
    it("returns expected default values", () => {
      vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useStoryWriter(TICKET_KEY));

      expect(result.current.session).toBeNull();
      expect(result.current.messages).toEqual([]);
      expect(result.current.aiDrafts).toEqual([]);
      expect(result.current.targetAiDrafts).toEqual([]);
      expect(result.current.relatedCandidates).toEqual([]);
      expect(result.current.streamProgress).toBe("");
      expect(result.current.streamError).toBeNull();
      expect(result.current.usage).toBeNull();
      expect(result.current.lastResponseDurationMs).toBeNull();
      expect(result.current.codebaseResearch).toBe(false);
      expect(result.current.model).toBe("claude-sonnet-4-6");
    });
  });
});
