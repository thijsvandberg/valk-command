import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

let mockApiKey = "test-key";
vi.mock("@/lib/env", () => ({
  get env() {
    return { ANTHROPIC_API_KEY: mockApiKey };
  },
}));

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/ai/rewrite-titles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/rewrite-titles", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockApiKey = "test-key";
  });

  it("returns 400 for invalid body (missing tickets)", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request");
  });

  it("returns 400 for empty tickets array", async () => {
    const res = await POST(makeRequest({ tickets: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid ticket shape", async () => {
    const res = await POST(makeRequest({ tickets: [{ key: "VPL-1" }] }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    mockApiKey = "";
    const res = await POST(
      makeRequest({
        tickets: [{ key: "VPL-1", title: "Test", points: 3, epicName: null }],
      }),
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain("ANTHROPIC_API_KEY");
  });

  it("returns rewritten titles on success", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            tickets: [{ key: "VPL-1", title: "Improved login security" }],
          }),
        },
      ],
    });

    const res = await POST(
      makeRequest({
        tickets: [
          {
            key: "VPL-1",
            title: "Refactor auth middleware to support session token rotation",
            points: 5,
            epicName: "Authentication",
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tickets).toEqual([
      { key: "VPL-1", title: "Improved login security" },
    ]);
    expect(data.fallback).toBeUndefined();
  });

  it("falls back to original titles when AI returns malformed JSON", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "This is not JSON at all" }],
    });

    const res = await POST(
      makeRequest({
        tickets: [
          { key: "VPL-2", title: "Add retry logic", points: 3, epicName: null },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tickets).toEqual([{ key: "VPL-2", title: "Add retry logic" }]);
    expect(data.fallback).toBe(true);
  });

  it("falls back when AI call throws", async () => {
    mockCreate.mockRejectedValue(new Error("API error"));

    const res = await POST(
      makeRequest({
        tickets: [
          { key: "VPL-3", title: "Fix bug", points: null, epicName: "Core" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tickets).toEqual([{ key: "VPL-3", title: "Fix bug" }]);
    expect(data.fallback).toBe(true);
  });

  it("handles multiple tickets", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            tickets: [
              { key: "VPL-1", title: "Better login" },
              { key: "VPL-2", title: "Faster notifications" },
              { key: "VPL-3", title: "New dashboard" },
            ],
          }),
        },
      ],
    });

    const res = await POST(
      makeRequest({
        tickets: [
          { key: "VPL-1", title: "Refactor auth", points: 5, epicName: null },
          { key: "VPL-2", title: "Add retry logic", points: 3, epicName: null },
          { key: "VPL-3", title: "Velocity chart", points: 8, epicName: null },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tickets).toHaveLength(3);
  });

  it("includes epic context in the prompt", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            tickets: [{ key: "VPL-1", title: "Better search" }],
          }),
        },
      ],
    });

    await POST(
      makeRequest({
        tickets: [
          { key: "VPL-1", title: "Add search", points: 3, epicName: "Search & Discovery" },
        ],
      }),
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("Search & Discovery");
  });
});
