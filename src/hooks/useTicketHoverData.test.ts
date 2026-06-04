import { describe, it, expect } from "vitest";
import { buildTicketHoverData } from "./useTicketHoverData";
import type { Ticket } from "@/types/ticket";

const base = {
  key: "VPL-1",
  title: "Build it",
  type: "story",
  epic: "Onboarding",
  epicKey: "VPL-100",
  jiraStatus: "TO DO",
  storyPoints: 3,
  assignee: null,
  reporter: null,
  flagged: false,
  readiness: "drafting",
  poStatus: "todo",
  qualityScore: 80,
  businessValue: 5,
  editState: "clean",
  notes: "a note",
  sprintId: "42",
} as unknown as Ticket;

describe("buildTicketHoverData (BRDG-276 enrichment)", () => {
  it("carries sprintId and resolves the sprint name from the map", () => {
    const d = buildTicketHoverData(base, { "42": "BT 1" });
    expect(d.sprintId).toBe("42");
    expect(d.sprintName).toBe("BT 1");
  });

  it("includes the PO signals (readiness, quality, notes)", () => {
    const d = buildTicketHoverData(base);
    expect(d.readiness).toBe("drafting");
    expect(d.qualityScore).toBe(80);
    expect(d.notes).toBe("a note");
  });

  it("maps a clean edit state to null but keeps real ones", () => {
    expect(buildTicketHoverData(base).editState).toBeNull();
    expect(buildTicketHoverData({ ...base, editState: "conflict" } as Ticket).editState).toBe("conflict");
  });

  it("normalizes empty notes to null", () => {
    expect(buildTicketHoverData({ ...base, notes: "" } as Ticket).notes).toBeNull();
  });

  it("leaves sprintId null when the ticket has no sprint", () => {
    const d = buildTicketHoverData({ ...base, sprintId: undefined } as Ticket);
    expect(d.sprintId).toBeNull();
    expect(d.sprintName).toBeNull();
  });
});
