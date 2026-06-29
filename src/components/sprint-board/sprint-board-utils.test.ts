import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveTicketMetadata, saveStoryPoints, scopePlaceholdersToSprintFilter } from "./sprint-board-utils";

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
