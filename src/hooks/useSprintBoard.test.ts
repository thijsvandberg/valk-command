import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";
import {
  useTickets,
  useTicketDetail,
  useJiraSprints,
  useTicketReviews,
} from "./useSprintBoard";

// Fresh SWR cache per test to avoid cross-test pollution
function swrWrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

const mockTicket = {
  key: "BRDG-101",
  title: "Implement login",
  type: "story",
  epic: "AUTH",
  epicKey: "EP-1",
  jiraStatus: "TO DO",
  storyPoints: 3,
  assignee: null,
  flagged: false,
  poStatus: null,
  qualityScore: null,
  editState: "clean",
  notes: "",
  sprintId: "sprint-1",
};

const mockTicketDetail = {
  key: "BRDG-101",
  title: "Implement login",
  description: "As a user I want to log in",
  reporter: null,
  labels: [],
  components: [],
  priority: "Medium",
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-02T10:00:00.000Z",
  attachments: [],
  subtasks: [],
  linkedIssues: [],
  jiraComments: [],
};

const mockSprint = {
  id: 100,
  name: "Sprint 12",
  state: "active",
  startDate: "2026-04-01",
  endDate: "2026-04-14",
};

const mockReviewsResponse = {
  reviews: [
    {
      id: "rev-1",
      ticketKey: "BRDG-101",
      createdAt: "2026-04-05T10:00:00.000Z",
      source: "ticket-detail",
      storyVersionHash: "abc123",
      storyVersionNumber: 1,
      overallScore: 7,
      dimensions: [{ key: "clarity", label: "Clarity", score: 8, feedback: "Good" }],
      summary: "Solid story",
      suggestions: ["Add acceptance criteria"],
    },
  ],
  currentVersionHash: "abc123",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// useTickets
// ---------------------------------------------------------------------------
describe("useTickets", () => {
  it("fetches tickets for a specific sprint", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTicket],
    } as Response);

    const { result } = renderHook(() => useTickets("sprint-1"), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual([mockTicket]);
    expect(fetch).toHaveBeenCalledWith("/api/tickets?sprintId=sprint-1", expect.objectContaining({}));
  });

  it("fetches all tickets when sprintId is __all__", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTicket],
    } as Response);

    const { result } = renderHook(() => useTickets("__all__"), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual([mockTicket]);
    expect(fetch).toHaveBeenCalledWith("/api/tickets", expect.objectContaining({}));
  });

  it("does not fetch when sprintId is null", async () => {
    vi.spyOn(global, "fetch");

    const { result } = renderHook(() => useTickets(null), { wrapper: swrWrapper });

    // SWR should never fire a request when the key is null
    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sets error when fetch fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => null,
    } as Response);

    const { result } = renderHook(() => useTickets("sprint-1"), { wrapper: swrWrapper });

    // swrFetcher throws on !ok, SWR catches and sets error
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useTicketDetail
// ---------------------------------------------------------------------------
describe("useTicketDetail", () => {
  it("fetches ticket detail by key", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === "/api/tickets/BRDG-101") {
        return { ok: true, json: async () => mockTicketDetail } as Response;
      }
      // Background staleness check
      if (urlStr.startsWith("/api/jira/check-updated")) {
        return { ok: true, json: async () => ({ stale: false }) } as Response;
      }
      return { ok: false, status: 500, json: async () => null } as Response;
    });

    const { result } = renderHook(() => useTicketDetail("BRDG-101"), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual(mockTicketDetail);
    expect(fetch).toHaveBeenCalledWith("/api/tickets/BRDG-101", expect.objectContaining({}));
  });

  it("does not fetch when ticketKey is null", async () => {
    vi.spyOn(global, "fetch");

    const { result } = renderHook(() => useTicketDetail(null), { wrapper: swrWrapper });

    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("triggers sync when background check finds stale data", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === "/api/tickets/BRDG-101") {
        return { ok: true, json: async () => mockTicketDetail } as Response;
      }
      if (urlStr.startsWith("/api/jira/check-updated")) {
        return { ok: true, json: async () => ({ stale: true }) } as Response;
      }
      if (urlStr === "/api/jira/sync-tickets") {
        return { ok: true, json: async () => ({}) } as Response;
      }
      return { ok: false, status: 500, json: async () => null } as Response;
    });

    renderHook(() => useTicketDetail("BRDG-101"), { wrapper: swrWrapper });

    // Wait for the deferred (3s) background staleness check and sync to fire
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => {
        const arg = c[0];
        return typeof arg === "string" ? arg : arg.toString();
      });
      expect(calls).toContain("/api/jira/sync-tickets");
    }, { timeout: 8000 });
  }, 10000);
});

// ---------------------------------------------------------------------------
// useJiraSprints
// ---------------------------------------------------------------------------
describe("useJiraSprints", () => {
  it("fetches the sprint list", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sprints: [mockSprint], backlogCount: 5 }),
    } as Response);

    const { result } = renderHook(() => useJiraSprints(), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.sprints.length).toBeGreaterThan(0));

    expect(result.current.sprints).toEqual([mockSprint]);
    expect(result.current.backlogCount).toBe(5);
    expect(fetch).toHaveBeenCalledWith("/api/jira/sprints", expect.objectContaining({}));
  });

  it("sets error when server responds with error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => null,
    } as Response);

    const { result } = renderHook(() => useJiraSprints(), { wrapper: swrWrapper });

    // swrFetcher throws on !ok, SWR catches and sets error
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.sprints).toEqual([]);
    expect(result.current.backlogCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// useTicketReviews
// ---------------------------------------------------------------------------
describe("useTicketReviews", () => {
  it("fetches reviews for a ticket", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockReviewsResponse,
    } as Response);

    const { result } = renderHook(() => useTicketReviews("BRDG-101"), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual(mockReviewsResponse);
    expect(fetch).toHaveBeenCalledWith("/api/tickets/BRDG-101/reviews", expect.objectContaining({}));
  });

  it("does not fetch when ticketKey is null", async () => {
    vi.spyOn(global, "fetch");

    const { result } = renderHook(() => useTicketReviews(null), { wrapper: swrWrapper });

    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saveReview posts to the API and revalidates", async () => {
    const savedReview = { ...mockReviewsResponse.reviews[0], id: "rev-new" };

    vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      const method = init && typeof init === "object" && "method" in init ? (init.method ?? "GET") : "GET";

      if (urlStr === "/api/tickets/BRDG-101/reviews" && method === "GET") {
        return { ok: true, json: async () => mockReviewsResponse } as Response;
      }
      if (urlStr === "/api/tickets/BRDG-101/reviews" && method === "POST") {
        return { ok: true, json: async () => savedReview } as Response;
      }
      // Revalidation calls
      return { ok: true, json: async () => null } as Response;
    });

    const { result } = renderHook(() => useTicketReviews("BRDG-101"), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    let saved;
    await act(async () => {
      saved = await result.current.saveReview({
        source: "ticket-detail",
        overallScore: 7,
        dimensions: [{ key: "clarity", label: "Clarity", score: 8, feedback: "Good" }],
        summary: "Solid story",
        suggestions: ["Add acceptance criteria"],
      });
    });

    expect(saved).toEqual(savedReview);

    // Verify POST was made
    const postCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => {
      const init = c[1];
      return init && typeof init === "object" && "method" in init && init.method === "POST";
    });
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("deleteReview sends DELETE and revalidates", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      const method = init && typeof init === "object" && "method" in init ? (init.method ?? "GET") : "GET";

      if (urlStr === "/api/tickets/BRDG-101/reviews" && method === "GET") {
        return { ok: true, json: async () => mockReviewsResponse } as Response;
      }
      if (urlStr === "/api/tickets/BRDG-101/reviews/rev-1" && method === "DELETE") {
        return { ok: true, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => null } as Response;
    });

    const { result } = renderHook(() => useTicketReviews("BRDG-101"), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteReview("rev-1");
    });

    expect(deleted).toBe(true);

    const deleteCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => {
      const init = c[1];
      return init && typeof init === "object" && "method" in init && init.method === "DELETE";
    });
    expect(deleteCalls.length).toBe(1);
  });

  it("saveReview returns null when ticketKey is null", async () => {
    vi.spyOn(global, "fetch");

    const { result } = renderHook(() => useTicketReviews(null), { wrapper: swrWrapper });

    let saved;
    await act(async () => {
      saved = await result.current.saveReview({
        source: "chat",
        overallScore: 5,
        dimensions: [],
        summary: "test",
        suggestions: [],
      });
    });

    expect(saved).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deleteReview returns false when ticketKey is null", async () => {
    vi.spyOn(global, "fetch");

    const { result } = renderHook(() => useTicketReviews(null), { wrapper: swrWrapper });

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteReview("rev-1");
    });

    expect(deleted).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

