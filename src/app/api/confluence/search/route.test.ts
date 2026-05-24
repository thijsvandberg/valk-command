// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/confluence-client", () => ({
  confluenceClient: {
    isLive: true,
    searchPages: vi.fn(),
    searchByText: vi.fn(),
    searchByCql: vi.fn(),
  },
}));

import { confluenceClient } from "@/lib/confluence-client";
import { applyRateLimit } from "@/lib/rate-limiter";
import { GET } from "./route";

const MOCK_RESULTS = [
  {
    pageId: "123",
    title: "Rate Calculation Architecture",
    url: "https://example.atlassian.net/wiki/spaces/ENG/pages/123",
    spaceKey: "ENG",
    spaceTitle: "Engineering",
    lastModified: "2026-01-01T00:00:00.000Z",
    excerpt: "Describes the original design for rate calculation.",
  },
];

function makeRequest(search = "") {
  return new Request(`http://localhost:3100/api/confluence/search${search}`);
}

describe("GET /api/confluence/search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(applyRateLimit).mockReturnValue(null);
    Object.assign(confluenceClient, { isLive: true });
  });

  it("returns 400 when q is missing", async () => {
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/q is required/);
  });

  it("returns 400 for unknown mode", async () => {
    const res = await GET(makeRequest("?q=test&mode=unknown") as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/mode must be one of/);
  });

  it("returns 503 when Confluence is not configured", async () => {
    Object.assign(confluenceClient, { isLive: false });
    const res = await GET(makeRequest("?q=test") as never);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/not configured/);
  });

  it("calls searchPages for default mode (title)", async () => {
    vi.mocked(confluenceClient.searchPages).mockResolvedValue(MOCK_RESULTS);
    const res = await GET(makeRequest("?q=rate+calculation") as never);
    expect(res.status).toBe(200);
    expect(confluenceClient.searchPages).toHaveBeenCalledWith("rate calculation", undefined);
    const data = await res.json();
    expect(data.results).toEqual(MOCK_RESULTS);
  });

  it("calls searchPages with space param when provided", async () => {
    vi.mocked(confluenceClient.searchPages).mockResolvedValue(MOCK_RESULTS);
    await GET(makeRequest("?q=test&mode=title&space=ENG") as never);
    expect(confluenceClient.searchPages).toHaveBeenCalledWith("test", "ENG");
  });

  it("calls searchByText when mode=text", async () => {
    vi.mocked(confluenceClient.searchByText).mockResolvedValue(MOCK_RESULTS);
    const res = await GET(makeRequest("?q=rate+calculation&mode=text") as never);
    expect(res.status).toBe(200);
    expect(confluenceClient.searchByText).toHaveBeenCalledWith("rate calculation", undefined);
  });

  it("calls searchByText with space when mode=text and space is provided", async () => {
    vi.mocked(confluenceClient.searchByText).mockResolvedValue([]);
    await GET(makeRequest("?q=test&mode=text&space=PRODUCT") as never);
    expect(confluenceClient.searchByText).toHaveBeenCalledWith("test", "PRODUCT");
  });

  it("calls searchByCql when mode=cql", async () => {
    vi.mocked(confluenceClient.searchByCql).mockResolvedValue(MOCK_RESULTS);
    const cql = encodeURIComponent('text~"VPL-20661" AND type=page');
    const res = await GET(makeRequest(`?q=${cql}&mode=cql`) as never);
    expect(res.status).toBe(200);
    expect(confluenceClient.searchByCql).toHaveBeenCalledWith('text~"VPL-20661" AND type=page');
  });

  it("returns 502 when Confluence API throws", async () => {
    vi.mocked(confluenceClient.searchPages).mockRejectedValue(new Error("Confluence API 500: internal"));
    const res = await GET(makeRequest("?q=test") as never);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("Confluence search failed");
  });
});
