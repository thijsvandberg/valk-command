import { describe, it, expect } from "vitest";
import { orderByOldestScan, selectScanBatch, type ScannableTicket } from "./deprecation-scan-batch";

describe("orderByOldestScan", () => {
  it("orders by oldest lastScannedAt first", () => {
    const ordered = orderByOldestScan([
      { jiraKey: "A", lastScannedAt: "2025-03-01T00:00:00.000Z" },
      { jiraKey: "B", lastScannedAt: "2025-01-01T00:00:00.000Z" },
      { jiraKey: "C", lastScannedAt: "2025-02-01T00:00:00.000Z" },
    ]);
    expect(ordered.map((t) => t.jiraKey)).toEqual(["B", "C", "A"]);
  });

  it("places never-scanned (null) tickets first", () => {
    const ordered = orderByOldestScan([
      { jiraKey: "A", lastScannedAt: "2025-03-01T00:00:00.000Z" },
      { jiraKey: "B", lastScannedAt: null },
      { jiraKey: "C", lastScannedAt: "2025-01-01T00:00:00.000Z" },
      { jiraKey: "D", lastScannedAt: null },
    ]);
    // Nulls first, then oldest-scanned; ties broken by key.
    expect(ordered.map((t) => t.jiraKey)).toEqual(["B", "D", "C", "A"]);
  });

  it("breaks ties deterministically by jiraKey", () => {
    const ts = "2025-01-01T00:00:00.000Z";
    const ordered = orderByOldestScan([
      { jiraKey: "C", lastScannedAt: ts },
      { jiraKey: "A", lastScannedAt: ts },
      { jiraKey: "B", lastScannedAt: ts },
    ]);
    expect(ordered.map((t) => t.jiraKey)).toEqual(["A", "B", "C"]);
  });

  it("does not mutate the input array", () => {
    const input: ScannableTicket[] = [
      { jiraKey: "A", lastScannedAt: "2025-03-01T00:00:00.000Z" },
      { jiraKey: "B", lastScannedAt: null },
    ];
    orderByOldestScan(input);
    expect(input.map((t) => t.jiraKey)).toEqual(["A", "B"]);
  });
});

describe("selectScanBatch", () => {
  it("takes at most batchSize tickets, oldest first", () => {
    const tickets = [
      { jiraKey: "A", lastScannedAt: "2025-03-01T00:00:00.000Z" },
      { jiraKey: "B", lastScannedAt: null },
      { jiraKey: "C", lastScannedAt: "2025-01-01T00:00:00.000Z" },
    ];
    const batch = selectScanBatch(tickets, 2);
    expect(batch.map((t) => t.jiraKey)).toEqual(["B", "C"]);
  });

  it("rotates: stamping a batch moves it to the back on the next pass", () => {
    // Simulate two consecutive ticks over a 3-ticket backlog with batch size 2.
    let tickets: ScannableTicket[] = [
      { jiraKey: "A", lastScannedAt: null },
      { jiraKey: "B", lastScannedAt: null },
      { jiraKey: "C", lastScannedAt: null },
    ];

    const firstBatch = selectScanBatch(tickets, 2);
    expect(firstBatch.map((t) => t.jiraKey)).toEqual(["A", "B"]);

    // Stamp the scanned tickets with an increasing timestamp.
    const stamp1 = "2025-01-01T00:00:00.000Z";
    tickets = tickets.map((t) =>
      firstBatch.some((b) => b.jiraKey === t.jiraKey) ? { ...t, lastScannedAt: stamp1 } : t,
    );

    // Second tick: C (never scanned) leads, then the oldest of the stamped pair.
    const secondBatch = selectScanBatch(tickets, 2);
    expect(secondBatch.map((t) => t.jiraKey)).toEqual(["C", "A"]);
  });

  it("wraps around once every ticket has been scanned", () => {
    // All scanned; the very oldest comes back to the front (continuous re-scan).
    const tickets = [
      { jiraKey: "A", lastScannedAt: "2025-01-03T00:00:00.000Z" },
      { jiraKey: "B", lastScannedAt: "2025-01-01T00:00:00.000Z" },
      { jiraKey: "C", lastScannedAt: "2025-01-02T00:00:00.000Z" },
    ];
    const batch = selectScanBatch(tickets, 1);
    expect(batch.map((t) => t.jiraKey)).toEqual(["B"]);
  });

  it("returns an empty batch for a non-positive size", () => {
    const tickets = [{ jiraKey: "A", lastScannedAt: null }];
    expect(selectScanBatch(tickets, 0)).toEqual([]);
    expect(selectScanBatch(tickets, -5)).toEqual([]);
  });
});
