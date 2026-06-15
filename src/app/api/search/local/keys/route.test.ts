// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/local-search-engine", () => ({
  executeLocalKeyMatch: vi.fn(),
}));

const { executeLocalKeyMatch } = await import("@/lib/local-search-engine");

function makeRequest(q: string) {
  return new Request(`http://localhost/api/search/local/keys?q=${encodeURIComponent(q)}`);
}

describe("GET /api/search/local/keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the matching keys for a query", async () => {
    vi.mocked(executeLocalKeyMatch).mockResolvedValue(["VPL-1", "VPL-2"]);
    const res = await GET(makeRequest("heartbeat"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.keys).toEqual(["VPL-1", "VPL-2"]);
    expect(executeLocalKeyMatch).toHaveBeenCalledWith("heartbeat");
  });

  it("passes the query through verbatim (engine owns the 2-char gate)", async () => {
    vi.mocked(executeLocalKeyMatch).mockResolvedValue([]);
    const res = await GET(makeRequest("a"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.keys).toEqual([]);
    expect(executeLocalKeyMatch).toHaveBeenCalledWith("a");
  });

  it("defaults to an empty query when q is absent", async () => {
    vi.mocked(executeLocalKeyMatch).mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/search/local/keys"));
    await res.json();
    expect(executeLocalKeyMatch).toHaveBeenCalledWith("");
  });

  it("returns 500 when the engine throws", async () => {
    vi.mocked(executeLocalKeyMatch).mockRejectedValue(new Error("boom"));
    const res = await GET(makeRequest("anything"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Search failed");
  });
});
