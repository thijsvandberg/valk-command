import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveTicketMetadata, saveStoryPoints, scopePlaceholdersToSprintFilter, shouldAutoEnableTestDocTag, readTestDocTagSprints, persistTestDocTagSprints } from "./sprint-board-utils";

const globalMutate = vi.fn();
const updateMetadata = vi.fn();
const updateStoryPoints = vi.fn();

vi.mock("swr", () => ({
  mutate: (...args: unknown[]) => globalMutate(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  tickets: {
    updateMetadata: (...args: unknown[]) => updateMetadata(...args),
    updateStoryPoints: (...args: unknown[]) => updateStoryPoints(...args),
  },
  workspaceTasks: { create: vi.fn() },
}));

const LIST_KEY = "/api/tickets?sprintId=42";

function listPatchCalls() {
  return globalMutate.mock.calls.filter((c) => c[0] === LIST_KEY);
}

beforeEach(() => {
  globalMutate.mockReset();
  updateMetadata.mockReset().mockResolvedValue(undefined);
  updateStoryPoints.mockReset().mockResolvedValue(undefined);
});

describe("saveTicketMetadata patchList option (BRDG-383)", () => {
  it("patches the list cache by default (overlay-less callers like MultiSprintView)", async () => {
    await saveTicketMetadata("VPL-1", { businessValue: 5 }, LIST_KEY);
    expect(listPatchCalls().length).toBeGreaterThan(0);
  });

  it("does NOT patch the list cache when patchList is false", async () => {
    await saveTicketMetadata("VPL-1", { businessValue: 5 }, LIST_KEY, { patchList: false });
    expect(listPatchCalls()).toHaveLength(0);
  });

  it("still patches the detail cache when patchList is false (sidebar re-seed)", async () => {
    await saveTicketMetadata("VPL-1", { businessValue: 5 }, LIST_KEY, { patchList: false });
    const detailPatches = globalMutate.mock.calls.filter((c) => c[0] === "/api/tickets/VPL-1");
    expect(detailPatches.length).toBeGreaterThan(0);
  });

  it("does not revalidate the list on failure when patchList is false", async () => {
    updateMetadata.mockRejectedValueOnce(new Error("boom"));
    const ok = await saveTicketMetadata("VPL-1", { businessValue: 5 }, LIST_KEY, { patchList: false });
    expect(ok).toBe(false);
    expect(listPatchCalls()).toHaveLength(0);
  });

  it("still saves to the API regardless of patchList", async () => {
    await saveTicketMetadata("VPL-1", { businessValue: 5 }, LIST_KEY, { patchList: false });
    expect(updateMetadata).toHaveBeenCalledWith("VPL-1", { businessValue: 5 });
  });
});

describe("saveStoryPoints patchList option (BRDG-383)", () => {
  it("patches the list cache by default", async () => {
    await saveStoryPoints("VPL-1", 8, LIST_KEY);
    expect(listPatchCalls().length).toBeGreaterThan(0);
  });

  it("does NOT patch the list cache when patchList is false", async () => {
    await saveStoryPoints("VPL-1", 8, LIST_KEY, { patchList: false });
    expect(listPatchCalls()).toHaveLength(0);
  });

  it("still patches the detail cache and saves to the API when patchList is false", async () => {
    await saveStoryPoints("VPL-1", 8, LIST_KEY, { patchList: false });
    expect(globalMutate.mock.calls.some((c) => c[0] === "/api/tickets/VPL-1")).toBe(true);
    expect(updateStoryPoints).toHaveBeenCalledWith("VPL-1", 8);
  });
});

describe("scopePlaceholdersToSprintFilter (BRDG-304)", () => {
  const stateMap = { o1: "future", bt142: "future", s_closed: "closed" };
  const ph = (id: string, sprintId: string | null) => ({ id, sprintId });

  it("returns the original array unchanged when the scope is inactive", () => {
    const list = [ph("p1", "o1"), ph("p2", "bt142")];
    const out = scopePlaceholdersToSprintFilter(list, {
      active: false,
      selectedSprintIds: new Set(),
      selectedSprintStates: new Set(),
      sprintStateMap: stateMap,
    });
    expect(out).toBe(list);
  });

  it("keeps only placeholders whose sprint is explicitly selected by id", () => {
    const list = [ph("p1", "o1"), ph("p2", "bt142")];
    const out = scopePlaceholdersToSprintFilter(list, {
      active: true,
      selectedSprintIds: new Set(["o1"]),
      selectedSprintStates: new Set(),
      sprintStateMap: stateMap,
    });
    expect(out.map((p) => p.id)).toEqual(["p1"]);
  });

  it("drops a placeholder from a sprint that is not in the active filter (the BT:142 leak)", () => {
    const list = [ph("p2", "bt142")];
    const out = scopePlaceholdersToSprintFilter(list, {
      active: true,
      selectedSprintIds: new Set(["o1"]),
      selectedSprintStates: new Set(),
      sprintStateMap: stateMap,
    });
    expect(out).toEqual([]);
  });

  it("keeps a placeholder whose sprint state matches a selected bucket", () => {
    const list = [ph("p1", "o1"), ph("p3", "s_closed")];
    const out = scopePlaceholdersToSprintFilter(list, {
      active: true,
      selectedSprintIds: new Set(),
      selectedSprintStates: new Set(["future"]),
      sprintStateMap: stateMap,
    });
    expect(out.map((p) => p.id)).toEqual(["p1"]);
  });

  it("drops backlog placeholders (no sprint) from any sprint scope", () => {
    const list = [ph("p1", "o1"), ph("pb", null)];
    const out = scopePlaceholdersToSprintFilter(list, {
      active: true,
      selectedSprintIds: new Set(["o1"]),
      selectedSprintStates: new Set(),
      sprintStateMap: stateMap,
    });
    expect(out.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("shouldAutoEnableTestDocTag (BRDG-426)", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const store = { ...initial };
    return {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      store,
    };
  }

  it("fires once when the last working day is reached, then never again", () => {
    const storage = fakeStorage();
    expect(shouldAutoEnableTestDocTag("6361", 1, storage)).toBe(true);
    expect(storage.store["bridge:test-doc-tag-auto:6361"]).toBe("1");
    expect(shouldAutoEnableTestDocTag("6361", 1, storage)).toBe(false);
    expect(shouldAutoEnableTestDocTag("6361", 0, storage)).toBe(false);
  });

  it("also covers opening the board after the end date (remaining 0)", () => {
    expect(shouldAutoEnableTestDocTag("6361", 0, fakeStorage())).toBe(true);
  });

  it("stays quiet mid-sprint, without a sprint, and per sprint independently", () => {
    const storage = fakeStorage();
    expect(shouldAutoEnableTestDocTag("6361", 5, storage)).toBe(false);
    expect(shouldAutoEnableTestDocTag(null, 1, storage)).toBe(false);
    expect(shouldAutoEnableTestDocTag("6361", null, storage)).toBe(false);
    // A new sprint gets its own once-only flag.
    expect(shouldAutoEnableTestDocTag("6361", 1, storage)).toBe(true);
    expect(shouldAutoEnableTestDocTag("6394", 1, storage)).toBe(true);
  });
});

describe("test-doc tag per-sprint persistence (BRDG-426)", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const store = { ...initial };
    return {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      store,
    };
  }

  it("round-trips the enabled sprint ids", () => {
    const storage = fakeStorage();
    persistTestDocTagSprints(new Set(["6361", "6394"]), storage);
    expect(readTestDocTagSprints(storage)).toEqual(new Set(["6361", "6394"]));
  });

  it("returns an empty set on missing or corrupt storage", () => {
    expect(readTestDocTagSprints(fakeStorage())).toEqual(new Set());
    expect(readTestDocTagSprints(fakeStorage({ "bridge:test-doc-tag-sprints": "{not json" }))).toEqual(new Set());
    expect(readTestDocTagSprints(fakeStorage({ "bridge:test-doc-tag-sprints": '"scalar"' }))).toEqual(new Set());
  });
});
