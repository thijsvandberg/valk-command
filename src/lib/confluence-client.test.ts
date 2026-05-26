// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    CONFLUENCE_BASE_URL: "https://test.atlassian.net",
    CONFLUENCE_EMAIL: "user@test.com",
    CONFLUENCE_API_TOKEN: "test-token",
    CONFLUENCE_SPACE_KEY: "TST",
    JIRA_BASE_URL: "",
    JIRA_EMAIL: "",
    JIRA_API_TOKEN: "",
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  trackOutboundCall: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { confluenceClient } from "./confluence-client";

describe("confluenceClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isLive returns true when credentials are configured", () => {
    expect(confluenceClient.isLive).toBe(true);
  });

  it("searchPages constructs correct CQL with space key", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await confluenceClient.searchPages("design doc");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("content/search");
    expect(url).toContain("cql=");
    expect(url).toContain("type%3Dpage");
  });

  it("searchPages works without explicit space key", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await confluenceClient.searchPages("test", undefined);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("content/search");
  });

  it("getPage returns mapped ConfluencePage", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "12345",
        title: "Test Page",
        _links: { webui: "/spaces/TST/pages/12345" },
        version: { when: "2026-05-26T10:00:00Z", by: { displayName: "Alice" } },
        body: { view: { value: "<p>Hello</p>" } },
      }),
    });

    const page = await confluenceClient.getPage("12345");

    expect(page.pageId).toBe("12345");
    expect(page.title).toBe("Test Page");
    expect(page.bodyHtml).toBe("<p>Hello</p>");
    expect(page.lastModifiedBy).toBe("Alice");
    expect(page.url).toContain("/wiki/spaces/TST/pages/12345");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    });

    await expect(confluenceClient.checkHealth()).rejects.toThrow("Confluence API 403");
  });

  it("checkHealth calls spaces endpoint", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ key: "TST", name: "Test Space" }] }),
    });

    const result = await confluenceClient.checkHealth();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/wiki/api/v2/spaces");
    expect(result.displayName).toBe("user@test.com");
  });

  it("mapSearchResults strips HTML from excerpts", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          id: "1",
          title: "Result",
          _links: { webui: "/page/1" },
          space: { key: "TST", name: "Test" },
          history: { lastUpdated: { when: "2026-05-26T10:00:00Z" } },
          excerpt: "This is <em>highlighted</em> text",
        }],
      }),
    });

    const results = await confluenceClient.searchPages("query");
    expect(results[0].excerpt).toBe("This is highlighted text");
  });
});
