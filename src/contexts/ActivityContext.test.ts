import { describe, it, expect } from "vitest";
import { collectNewToasts } from "./ActivityContext";
import type { ActivityLogEntry } from "@/types/ticket";

function entry(overrides: Partial<ActivityLogEntry> & { id: string }): ActivityLogEntry {
  return {
    type: "ticket-sync",
    scope: null,
    status: "success",
    summary: "1 ticket synced",
    errorDetail: null,
    durationMs: 100,
    startedAt: "2026-06-10T08:00:00.000Z",
    completedAt: "2026-06-10T08:00:01.000Z",
    acknowledged: false,
    sprintName: null,
    ...overrides,
  };
}

describe("collectNewToasts", () => {
  it("toasts a new failed entry", () => {
    const knownIds = new Set<string>();
    const failed = entry({ id: "a", status: "failed", errorDetail: "Jira 500" });

    const toasts = collectNewToasts([failed], knownIds);

    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe("a");
    expect(toasts[0].entry.status).toBe("failed");
  });

  it("stays silent for successful background syncs", () => {
    const knownIds = new Set<string>();

    const toasts = collectNewToasts([entry({ id: "a", status: "success" })], knownIds);

    expect(toasts).toHaveLength(0);
    expect(knownIds.has("a")).toBe(true);
  });

  it("stays silent for cancelled entries", () => {
    const knownIds = new Set<string>();

    const toasts = collectNewToasts([entry({ id: "a", status: "cancelled" })], knownIds);

    expect(toasts).toHaveLength(0);
  });

  it("never toasts the same entry twice, even when invoked twice with the same data", () => {
    const knownIds = new Set<string>();
    const data = [entry({ id: "a", status: "failed" })];

    const first = collectNewToasts(data, knownIds);
    const second = collectNewToasts(data, knownIds);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("does not flood when a backlog of completed syncs arrives at once (tab refocus)", () => {
    const knownIds = new Set<string>();
    const backlog = Array.from({ length: 10 }, (_, i) =>
      entry({ id: `sync-${i}`, status: "success" }),
    );

    const toasts = collectNewToasts(backlog, knownIds);

    expect(toasts).toHaveLength(0);
    expect(knownIds.size).toBe(10);
  });

  it("only surfaces the failure from a mixed batch", () => {
    const knownIds = new Set<string>();
    const batch = [
      entry({ id: "ok-1", status: "success" }),
      entry({ id: "bad", status: "failed", errorDetail: "timeout" }),
      entry({ id: "ok-2", status: "success" }),
    ];

    const toasts = collectNewToasts(batch, knownIds);

    expect(toasts.map((t) => t.id)).toEqual(["bad"]);
  });

  it("leaves running entries unmarked so their final status is evaluated later", () => {
    const knownIds = new Set<string>();
    const running = entry({ id: "a", status: "running", completedAt: null });

    expect(collectNewToasts([running], knownIds)).toHaveLength(0);
    expect(knownIds.has("a")).toBe(false);

    const completed = entry({ id: "a", status: "failed" });
    const toasts = collectNewToasts([completed], knownIds);

    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe("a");
  });
});
