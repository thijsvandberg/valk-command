// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError, swrFetcher, tickets, conversations, jobs } from "./api-client";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(error: string, status = 400, code?: string) {
  return new Response(JSON.stringify({ error, ...(code ? { code } : {}) }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// apiFetch core
// ---------------------------------------------------------------------------

describe("apiFetch", () => {
  it("returns parsed JSON for successful GET", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "1", name: "test" }));

    const data = await apiFetch<{ id: string; name: string }>("/api/test");

    expect(data).toEqual({ id: "1", name: "test" });
    expect(mockFetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({}));
  });

  it("sends method, JSON body, and Content-Type header for POST", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/test", {
      method: "POST",
      body: { title: "hello" },
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/test");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ title: "hello" }));
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("throws ApiError with parsed body on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse("Not found", 404, "NOT_FOUND"));

    try {
      await apiFetch("/api/test/missing");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("NOT_FOUND");
      expect(apiErr.message).toBe("Not found");
      expect(apiErr.body).toEqual({ error: "Not found", code: "NOT_FOUND" });
    }
  });

  it("throws ApiError with generic message for non-JSON error body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    try {
      await apiFetch("/api/broken");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.body).toBeNull();
      expect(apiErr.message).toBe("Request failed (500)");
    }
  });

  it("forwards AbortSignal to fetch", async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/test", { signal: controller.signal });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it("propagates AbortError when request is aborted", async () => {
    const controller = new AbortController();
    mockFetch.mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"));

    controller.abort();

    await expect(apiFetch("/api/test", { signal: controller.signal })).rejects.toThrow("aborted");
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await apiFetch<void>("/api/test", { method: "DELETE" });

    expect(result).toBeUndefined();
  });

  it("merges custom headers with Content-Type", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/test", {
      method: "POST",
      body: { data: 1 },
      headers: { "X-Custom": "value" },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Custom"]).toBe("value");
  });

  it("does not set Content-Type when no body is provided", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/test");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// swrFetcher
// ---------------------------------------------------------------------------

describe("swrFetcher", () => {
  it("delegates to apiFetch", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([1, 2, 3]));

    const data = await swrFetcher<number[]>("/api/items");

    expect(data).toEqual([1, 2, 3]);
  });

  it("throws on error (SWR expects this)", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse("fail", 500));

    await expect(swrFetcher("/api/broken")).rejects.toThrow(ApiError);
  });
});

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

describe("URL builders", () => {
  it("tickets.listUrl builds correct URLs", () => {
    expect(tickets.listUrl("__all__")).toBe("/api/tickets");
    expect(tickets.listUrl("sprint-1")).toBe("/api/tickets?sprintId=sprint-1");
    expect(tickets.listUrl(null)).toBeNull();
    expect(tickets.listUrl(undefined)).toBeNull();
  });

  it("tickets.detailUrl encodes key", () => {
    expect(tickets.detailUrl("PROJ-123")).toBe("/api/tickets/PROJ-123");
    expect(tickets.detailUrl(null)).toBeNull();
  });

  it("conversations.messagesUrl builds correct URL", () => {
    expect(conversations.messagesUrl("abc-123")).toBe("/api/conversations/abc-123/messages");
  });

  it("jobs.detailUrl encodes id", () => {
    expect(jobs.detailUrl("job-1")).toBe("/api/jobs/job-1");
  });
});

// ---------------------------------------------------------------------------
// Typed endpoint functions
// ---------------------------------------------------------------------------

describe("endpoint functions", () => {
  it("tickets.list calls apiFetch with correct URL", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ key: "T-1" }]));

    const result = await tickets.list("sprint-1");

    expect(result).toEqual([{ key: "T-1" }]);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/tickets?sprintId=sprint-1");
  });

  it("tickets.update sends PUT with body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ key: "T-1", title: "updated" }));

    await tickets.update("T-1", { title: "updated" });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/tickets/T-1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ title: "updated" });
  });

  it("conversations.create sends POST", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "c1", title: "New" }));

    const conv = await conversations.create({ title: "New", type: "chat" });

    expect(conv.id).toBe("c1");
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
  });

  it("tickets.pullFromJira sends POST to correct URL", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await tickets.pullFromJira("PROJ-42");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/tickets/PROJ-42/pull-from-jira");
    expect(init.method).toBe("POST");
  });

  it("forwards signal to endpoint functions", async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    await tickets.list("s1", controller.signal);

    const [, init] = mockFetch.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });
});

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

describe("ApiError", () => {
  it("is an instance of Error", () => {
    const err = new ApiError(400, { error: "Bad request" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
  });

  it("uses fallback message when body is null", () => {
    const err = new ApiError(502, null);
    expect(err.message).toBe("Request failed (502)");
    expect(err.body).toBeNull();
    expect(err.code).toBeUndefined();
  });
});
