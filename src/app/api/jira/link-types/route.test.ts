// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: {
    getIssueLinkTypes: vi.fn().mockResolvedValue([
      { id: "1", name: "Relates", inward: "relates to", outward: "relates to" },
      { id: "2", name: "Blocks", inward: "is blocked by", outward: "blocks" },
      { id: "3", name: "Implementation", inward: "is implemented by", outward: "implements" },
    ]),
  },
}));

vi.mock("@/lib/cache", () => {
  const store = new Map<string, unknown>();
  return {
    cache: {
      get: vi.fn((key: string) => store.get(key)),
      set: vi.fn((key: string, value: unknown) => { store.set(key, value); }),
      invalidate: vi.fn(),
    },
    __store: store,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "./route";
import type { LinkTypeOption } from "./route";

describe("GET /api/jira/link-types", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { __store } = await import("@/lib/cache") as unknown as { __store: Map<string, unknown> };
    __store.clear();
  });

  it("returns transformed link types from Jira", async () => {
    const res = await GET();
    const data = await res.json();

    expect(data.linkTypes).toBeDefined();
    const types = data.linkTypes as LinkTypeOption[];

    // "Relates" is symmetric, so only 1 entry. "Blocks" and "Implementation" produce 2 each = 5 total
    expect(types).toHaveLength(5);

    const values = types.map((t: LinkTypeOption) => t.value);
    expect(values).toContain("relates to");
    expect(values).toContain("blocks");
    expect(values).toContain("is blocked by");
    expect(values).toContain("implements");
    expect(values).toContain("is implemented by");
  });

  it("skips duplicate entries for symmetric link types", async () => {
    const res = await GET();
    const data = await res.json();

    const relatesToEntries = (data.linkTypes as LinkTypeOption[]).filter(
      (t: LinkTypeOption) => t.value === "relates to",
    );
    expect(relatesToEntries).toHaveLength(1);
  });

  it("includes jiraTypeName and direction", async () => {
    const res = await GET();
    const data = await res.json();

    const blocks = (data.linkTypes as LinkTypeOption[]).find(
      (t: LinkTypeOption) => t.value === "blocks",
    );
    expect(blocks).toMatchObject({
      jiraTypeName: "Blocks",
      direction: "outward",
    });

    const isBlockedBy = (data.linkTypes as LinkTypeOption[]).find(
      (t: LinkTypeOption) => t.value === "is blocked by",
    );
    expect(isBlockedBy).toMatchObject({
      jiraTypeName: "Blocks",
      direction: "inward",
    });
  });

  it("returns fallback when Jira fails", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssueLinkTypes).mockRejectedValueOnce(new Error("Jira down"));

    const res = await GET();
    const data = await res.json();

    expect(data.linkTypes).toBeDefined();
    expect(data.linkTypes.length).toBeGreaterThan(0);
    const values = (data.linkTypes as LinkTypeOption[]).map((t: LinkTypeOption) => t.value);
    expect(values).toContain("relates to");
    expect(values).toContain("blocks");
  });

  it("returns fallback when Jira returns empty array", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    vi.mocked(jiraClient.getIssueLinkTypes).mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    expect(data.linkTypes.length).toBeGreaterThan(0);
  });

  it("caches the response for subsequent calls", async () => {
    const { jiraClient } = await import("@/lib/jira-client");
    const { cache } = await import("@/lib/cache");

    await GET();
    expect(cache.set).toHaveBeenCalled();

    // Second call should use cache
    vi.mocked(cache.get).mockReturnValueOnce([
      { value: "cached", label: "Cached", jiraTypeName: "Cached", direction: "outward" },
    ]);

    const res2 = await GET();
    const data2 = await res2.json();
    expect(data2.linkTypes[0].value).toBe("cached");
    // Jira should not be called again
    expect(jiraClient.getIssueLinkTypes).toHaveBeenCalledTimes(1);
  });

  it("sorts options alphabetically by label", async () => {
    const res = await GET();
    const data = await res.json();
    const labels = (data.linkTypes as LinkTypeOption[]).map((t: LinkTypeOption) => t.label);
    const sorted = [...labels].sort((a: string, b: string) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });
});
