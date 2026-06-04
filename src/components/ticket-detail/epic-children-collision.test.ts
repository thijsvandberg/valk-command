import { describe, it, expect, vi } from "vitest";

vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn((args: { droppableContainers: { id: string }[] }) =>
    args.droppableContainers.map((c) => ({ id: c.id })),
  ),
}));

import { epicChildrenCollisionDetection } from "./epic-children-collision";
import { closestCenter } from "@dnd-kit/core";

function container(id: string, type: "child" | "group") {
  return { id, key: id, data: { current: { type } }, rect: { current: null }, disabled: false, node: { current: null } };
}

function run(containers: ReturnType<typeof container>[]) {
  return epicChildrenCollisionDetection({
    active: { id: "drag", data: { current: {} }, rect: { current: { initial: null, translated: null } } } as never,
    collisionRect: { top: 0, left: 0, width: 100, height: 40, right: 100, bottom: 40 },
    droppableContainers: containers as never,
    droppableRects: new Map(),
    pointerCoordinates: null,
  });
}

describe("epicChildrenCollisionDetection", () => {
  it("resolves against row containers when any exist, ignoring group cards", () => {
    const result = run([container("Sprint 1", "group"), container("VPL-10", "child"), container("VPL-11", "child")]);
    // Only the child rows are passed to closestCenter; the group card is excluded.
    expect(result).toEqual([{ id: "VPL-10" }, { id: "VPL-11" }]);
    const passed = vi.mocked(closestCenter).mock.calls[0][0].droppableContainers.map((c) => c.id);
    expect(passed).toEqual(["VPL-10", "VPL-11"]);
  });

  it("falls back to group cards when there are no rows", () => {
    vi.mocked(closestCenter).mockClear();
    const result = run([container("Sprint 1", "group"), container("Sprint 2", "group")]);
    expect(result).toEqual([{ id: "Sprint 1" }, { id: "Sprint 2" }]);
  });
});
