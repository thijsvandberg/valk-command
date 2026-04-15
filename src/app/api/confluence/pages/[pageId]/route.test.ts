import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/confluence-client", () => ({
  confluenceClient: {
    isLive: true,
    getPage: vi.fn(),
  },
}));

// DOMPurify requires a DOM — use the identity mock so sanitize is a no-op in tests
vi.mock("isomorphic-dompurify", () => ({
  default: {
    sanitize: (html: string) => html,
  },
}));

import { confluenceClient } from "@/lib/confluence-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { GET } from "./route";

const MOCK_PAGE = {
  pageId: "42",
  title: "Rate Calculation Architecture",
  url: "https://example.atlassian.net/wiki/spaces/ENG/pages/42",
  lastModifiedAt: "2026-01-01T00:00:00.000Z",
  lastModifiedBy: "Alice",
  bodyHtml: "<p>This is the content of the page. " + "Word ".repeat(600) + "</p>",
};

function makeRequest(pageId: string, search = "") {
  return new Request(`http://localhost:3100/api/confluence/pages/${pageId}${search}`);
}

async function callGET(pageId: string, search = "") {
  return GET(makeRequest(pageId, search) as never, {
    params: Promise.resolve({ pageId }),
  });
}

describe("GET /api/confluence/pages/[pageId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(applyRateLimit).mockReturnValue(null);
    Object.assign(confluenceClient, { isLive: true });
    vi.mocked(confluenceClient.getPage).mockResolvedValue(MOCK_PAGE);
  });

  it("returns 503 when Confluence is not configured", async () => {
    Object.assign(confluenceClient, { isLive: false });
    const res = await callGET("42");
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid format", async () => {
    const res = await callGET("42", "?format=xml");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/format must be/);
  });

  it("returns 400 for invalid maxWords", async () => {
    const res = await callGET("42", "?maxWords=abc");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/maxWords/);
  });

  it("returns HTML by default (backward compatible)", async () => {
    vi.mocked(confluenceClient.getPage).mockResolvedValue({
      ...MOCK_PAGE,
      bodyHtml: "<p>Short content.</p>",
    });
    const res = await callGET("42");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("bodyHtml");
    expect(data).not.toHaveProperty("bodyText");
    expect(data.pageId).toBe("42");
    expect(data.title).toBe("Rate Calculation Architecture");
  });

  it("truncates HTML to default 500 words", async () => {
    const res = await callGET("42");
    expect(res.status).toBe(200);
    const data = await res.json();
    // Content has >600 words so it should be truncated
    expect(data.truncated).toBe(true);
    const wordCount = data.bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(500);
  });

  it("returns plain text when format=text", async () => {
    vi.mocked(confluenceClient.getPage).mockResolvedValue({
      ...MOCK_PAGE,
      bodyHtml: "<p>Hello <b>world</b>.</p>",
    });
    const res = await callGET("42", "?format=text");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("bodyText");
    expect(data).not.toHaveProperty("bodyHtml");
    expect(data.bodyText).not.toContain("<");
    expect(data.bodyText).toContain("Hello");
    expect(data.bodyText).toContain("world");
  });

  it("respects maxWords parameter", async () => {
    const res = await callGET("42", "?maxWords=100");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.truncated).toBe(true);
    const wordCount = data.bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(100);
  });

  it("caps maxWords at 3000 even if higher value is passed", async () => {
    // This just verifies no error; actual cap is internal
    const res = await callGET("42", "?maxWords=99999");
    expect(res.status).toBe(200);
  });

  it("returns 502 when Confluence API throws", async () => {
    vi.mocked(confluenceClient.getPage).mockRejectedValue(new Error("Confluence API 404: not found"));
    const res = await callGET("42");
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/Confluence API 404/);
  });
});
