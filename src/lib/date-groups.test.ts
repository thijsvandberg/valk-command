// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { groupByDate } from "./date-groups";
import type { Conversation } from "@/types/chat";

function makeConv(id: string, createdAt: string): Conversation {
  return { id, title: `Conv ${id}`, type: "chat", createdAt, relatedTicket: null, metadata: null, pinned: false, readAt: null };
}

function mockNow(dateStr: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(dateStr));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("groupByDate", () => {
  it("groups a conversation into Today", () => {
    mockNow("2026-05-22T14:00:00Z");
    const convs = [makeConv("1", "2026-05-22T10:00:00Z")];
    const groups = groupByDate(convs);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].conversations).toHaveLength(1);
  });

  it("groups a conversation into Yesterday", () => {
    mockNow("2026-05-22T14:00:00Z");
    const convs = [makeConv("1", "2026-05-21T10:00:00Z")];
    const groups = groupByDate(convs);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Yesterday");
  });

  it("groups into This week for same-week dates", () => {
    // 2026-05-22 is a Friday; Monday was 2026-05-18
    mockNow("2026-05-22T14:00:00Z");
    const convs = [makeConv("1", "2026-05-19T10:00:00Z")]; // Tuesday
    const groups = groupByDate(convs);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("This week");
  });

  it("groups into This month for same-month dates", () => {
    mockNow("2026-05-22T14:00:00Z");
    const convs = [makeConv("1", "2026-05-05T10:00:00Z")];
    const groups = groupByDate(convs);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("This month");
  });

  it("groups into Older for past-month dates", () => {
    mockNow("2026-05-22T14:00:00Z");
    const convs = [makeConv("1", "2026-03-10T10:00:00Z")];
    const groups = groupByDate(convs);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Older");
  });

  it("returns multiple groups when conversations span dates", () => {
    mockNow("2026-05-22T14:00:00Z");
    const convs = [
      makeConv("1", "2026-05-22T10:00:00Z"),
      makeConv("2", "2026-05-21T10:00:00Z"),
      makeConv("3", "2026-03-01T10:00:00Z"),
    ];
    const groups = groupByDate(convs);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Older"]);
  });

  it("omits empty groups", () => {
    mockNow("2026-05-22T14:00:00Z");
    const convs = [makeConv("1", "2026-05-22T10:00:00Z")];
    const groups = groupByDate(convs);
    expect(groups).toHaveLength(1);
  });

  it("returns empty array for no conversations", () => {
    const groups = groupByDate([]);
    expect(groups).toEqual([]);
  });
});
