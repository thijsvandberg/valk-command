import { describe, it, expect, beforeEach } from "vitest";
import type { Ticket } from "@/types/ticket";
import {
  registerPendingEdit,
  confirmPendingEdit,
  clearPendingEdit,
  hasPendingEdit,
  applyPendingEdits,
  valuesMatch,
  __getPendingEdits,
  __resetPendingEdits,
} from "./pendingTicketEdits";

function makeTicket(key: string, over: Partial<Ticket> = {}): Ticket {
  return {
    key, title: key, type: "story", epicKey: null, flagged: false,
    jiraStatus: "TO DO", storyPoints: null, businessValue: null,
    assignee: null, epic: null, qualityScore: null,
    readiness: null, poStatus: "Draft", editState: "clean", notes: "",
    ...over,
  } as Ticket;
}

const T0 = 1_000_000;

describe("pendingTicketEdits - applyPendingEdits", () => {
  beforeEach(() => __resetPendingEdits());

  it("returns the same reference when there are no edits", () => {
    const list = [makeTicket("A-1")];
    expect(applyPendingEdits(list, __getPendingEdits(), T0)).toBe(list);
  });

  it("overlays an optimistic value on top of a stale server list (anti snap-back)", () => {
    registerPendingEdit("A-1", "jiraStatus", "DONE", T0);
    // Server list still carries the pre-write value, as a racing refetch would.
    const stale = [makeTicket("A-1", { jiraStatus: "TO DO" })];
    const overlaid = applyPendingEdits(stale, __getPendingEdits(), T0)!;
    expect(overlaid.find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
  });

  it("keeps overlaying until the edit is cleared", () => {
    registerPendingEdit("A-1", "jiraStatus", "DONE", T0);
    const stale = [makeTicket("A-1")];
    expect(applyPendingEdits(stale, __getPendingEdits(), T0)![0].jiraStatus).toBe("DONE");
    clearPendingEdit("A-1", "jiraStatus");
    expect(applyPendingEdits(stale, __getPendingEdits(), T0)).toBe(stale);
  });

  it("stops overlaying once the edit is past its TTL so fresh server data can stand", () => {
    registerPendingEdit("A-1", "jiraStatus", "DONE", T0);
    const stale = [makeTicket("A-1")];
    // 31s later the safety-net TTL (30s) has passed.
    const overlaid = applyPendingEdits(stale, __getPendingEdits(), T0 + 31_000);
    expect(overlaid).toBe(stale);
  });

  it("applies multiple field edits to the same row, cloning once", () => {
    registerPendingEdit("A-1", "jiraStatus", "DONE", T0);
    registerPendingEdit("A-1", "businessValue", 8, T0);
    const list = [makeTicket("A-1"), makeTicket("A-2")];
    const overlaid = applyPendingEdits(list, __getPendingEdits(), T0)!;
    const row = overlaid.find((t) => t.key === "A-1")!;
    expect(row.jiraStatus).toBe("DONE");
    expect(row.businessValue).toBe(8);
    // Untouched row keeps its identity.
    expect(overlaid.find((t) => t.key === "A-2")).toBe(list[1]);
  });

  it("keeps a bookmarked toggle applied over a stale refetch until confirmed and matched (BRDG-355)", () => {
    // Toggle on; a racing refetch still returns the pre-write value.
    registerPendingEdit("A-1", "bookmarked", true, T0);
    const stale = [makeTicket("A-1", { bookmarked: false })];
    expect(applyPendingEdits(stale, __getPendingEdits(), T0)![0].bookmarked).toBe(true);

    // Confirm keeps it applied (the server may still lag) so it does not blink out.
    confirmPendingEdit("A-1", "bookmarked");
    expect(applyPendingEdits(stale, __getPendingEdits(), T0)![0].bookmarked).toBe(true);

    // Once server data reflects the value, the row self-heals to server data.
    const fresh = [makeTicket("A-1", { bookmarked: true })];
    expect(valuesMatch(fresh[0].bookmarked, true)).toBe(true);
  });

  it("overlays an object value such as assignee", () => {
    const assignee = { name: "Frank", initials: "F", color: "#abc" };
    registerPendingEdit("A-1", "assignee", assignee, T0);
    const overlaid = applyPendingEdits([makeTicket("A-1")], __getPendingEdits(), T0)!;
    expect(overlaid[0].assignee).toEqual(assignee);
  });
});

describe("pendingTicketEdits - store primitives", () => {
  beforeEach(() => __resetPendingEdits());

  it("tracks presence per ticket+field via hasPendingEdit", () => {
    expect(hasPendingEdit("A-1", "readiness")).toBe(false);
    registerPendingEdit("A-1", "readiness", "drafting", T0);
    expect(hasPendingEdit("A-1", "readiness")).toBe(true);
    expect(hasPendingEdit("A-1", "poStatus")).toBe(false); // different field
    clearPendingEdit("A-1", "readiness");
    expect(hasPendingEdit("A-1", "readiness")).toBe(false);
  });

  it("marks an edit confirmed without dropping it (board self-heal clears it later)", () => {
    registerPendingEdit("A-1", "jiraStatus", "DONE", T0);
    expect(__getPendingEdits().get("A-1::jiraStatus")?.confirmed).toBe(false);
    confirmPendingEdit("A-1", "jiraStatus");
    expect(__getPendingEdits().get("A-1::jiraStatus")?.confirmed).toBe(true);
    expect(hasPendingEdit("A-1", "jiraStatus")).toBe(true);
  });
});

describe("pendingTicketEdits - valuesMatch", () => {
  it("matches equal primitives and nulls", () => {
    expect(valuesMatch("DONE", "DONE")).toBe(true);
    expect(valuesMatch(null, null)).toBe(true);
    expect(valuesMatch(0, 0)).toBe(true);
  });

  it("does not match different primitives or null-vs-value", () => {
    expect(valuesMatch("DONE", "TO DO")).toBe(false);
    expect(valuesMatch(null, "DONE")).toBe(false);
    expect(valuesMatch("DONE", null)).toBe(false);
  });

  it("matches structurally-equal objects (e.g. assignee caught up server-side)", () => {
    expect(valuesMatch({ name: "Frank", initials: "F" }, { name: "Frank", initials: "F" })).toBe(true);
    expect(valuesMatch({ name: "Frank" }, { name: "Jane" })).toBe(false);
  });

  it("matches an assignee by name even when the server object has extra fields / different key order (BRDG-405)", () => {
    // Optimistic value vs the richer server value: the old full-object stringify never
    // matched, so the overlay lingered to its 30s TTL. Now they match on name.
    const optimistic = { name: "Frank", initials: "F", color: "hsl(1, 50%, 50%)" };
    const server = { accountId: "acc-1", avatar: "https://a/f.png", name: "Frank", initials: "F", color: "hsl(1, 50%, 50%)" };
    expect(valuesMatch(optimistic, server)).toBe(true);
    expect(valuesMatch(optimistic, { ...server, name: "Frances" })).toBe(false);
  });
});
