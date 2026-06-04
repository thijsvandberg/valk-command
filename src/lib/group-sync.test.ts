import { describe, it, expect, vi } from "vitest";
import {
  syncGroupInTranches,
  TRANCHE_SIZE,
  type GroupSyncTarget,
  type GroupSyncProgress,
  type GroupSyncDeps,
} from "./group-sync";

const sprintTarget: GroupSyncTarget = { kind: "sprint", id: "42", label: "Sprint 7" };

function makeDeps(keys: string[], overrides?: Partial<GroupSyncDeps>): GroupSyncDeps {
  return {
    fetchPlan: vi.fn().mockResolvedValue(keys),
    syncTranche: vi.fn().mockImplementation((batch: string[]) => Promise.resolve(batch.length)),
    reconcile: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function keys(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `VPL-${i + 1}`);
}

describe("syncGroupInTranches", () => {
  it("splits the plan into tranches of TRANCHE_SIZE", async () => {
    const allKeys = keys(60);
    const deps = makeDeps(allKeys);

    await syncGroupInTranches(sprintTarget, undefined, deps);

    // 60 keys -> ceil(60 / 25) = 3 batches of 25, 25, 10
    expect(deps.syncTranche).toHaveBeenCalledTimes(3);
    const sizes = (deps.syncTranche as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as string[]).length);
    expect(sizes).toEqual([TRANCHE_SIZE, TRANCHE_SIZE, 10]);
  });

  it("aggregates synced counts and returns removed from reconcile", async () => {
    const deps = makeDeps(keys(30), { reconcile: vi.fn().mockResolvedValue(2) });

    const result = await syncGroupInTranches(sprintTarget, undefined, deps);

    expect(result).toEqual({ synced: 30, removed: 2 });
    expect(deps.reconcile).toHaveBeenCalledWith(sprintTarget, keys(30), undefined);
  });

  it("reports progress through planning, syncing, reconciling and done", async () => {
    const deps = makeDeps(keys(50));
    const phases: GroupSyncProgress[] = [];

    await syncGroupInTranches(sprintTarget, (p) => phases.push({ ...p }), deps);

    expect(phases[0]).toEqual({ phase: "planning", done: 0, total: 0 });
    // After planning, total is known and syncing starts at 0.
    expect(phases.find((p) => p.phase === "syncing" && p.done === 0)?.total).toBe(50);
    // Syncing advances by tranche size.
    const syncDones = phases.filter((p) => p.phase === "syncing").map((p) => p.done);
    expect(syncDones).toEqual([0, 25, 50]);
    expect(phases.some((p) => p.phase === "reconciling")).toBe(true);
    expect(phases.at(-1)).toEqual({ phase: "done", done: 50, total: 50 });
  });

  it("handles an empty plan without syncing any tranche", async () => {
    const deps = makeDeps([]);

    const result = await syncGroupInTranches(sprintTarget, undefined, deps);

    expect(deps.syncTranche).not.toHaveBeenCalled();
    expect(deps.reconcile).toHaveBeenCalledWith(sprintTarget, [], undefined);
    expect(result).toEqual({ synced: 0, removed: 0 });
  });

  it("never reports done past total when a tranche over-counts", async () => {
    // A tranche could report a higher count than its batch (defensive); progress
    // must stay clamped to the plan total.
    const deps = makeDeps(keys(10), {
      syncTranche: vi.fn().mockResolvedValue(999),
    });
    const phases: GroupSyncProgress[] = [];

    await syncGroupInTranches(sprintTarget, (p) => phases.push({ ...p }), deps);

    expect(phases.filter((p) => p.phase === "syncing").every((p) => p.done <= p.total)).toBe(true);
  });

  it("propagates a tranche failure and stops", async () => {
    const deps = makeDeps(keys(30), {
      syncTranche: vi.fn().mockRejectedValue(new Error("network")),
    });

    await expect(syncGroupInTranches(sprintTarget, undefined, deps)).rejects.toThrow("network");
    expect(deps.reconcile).not.toHaveBeenCalled();
  });
});
