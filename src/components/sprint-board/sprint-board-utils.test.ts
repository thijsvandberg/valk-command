import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveTicketMetadata, saveStoryPoints } from "./sprint-board-utils";

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
