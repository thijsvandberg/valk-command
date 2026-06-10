import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Ticket } from "@/types/ticket";

// Controls the mocked single-ticket detail fetch. `detailKey` records the key
// useLinkedHoverData passed to useTicketDetail (null = no fetch requested).
const detailState = vi.hoisted(() => ({ data: undefined as unknown, key: null as string | null }));

vi.mock("@/hooks/useSprintBoard", () => ({
  useTickets: () => ({ data: [] }),
  useJiraSprints: () => ({ sprints: [{ id: "42", name: "BT 1" }] }),
  useTicketDetail: (key: string | null) => {
    detailState.key = key;
    return { data: key ? detailState.data : undefined };
  },
}));

import { buildTicketHoverData, useLinkedTicketData } from "./useTicketHoverData";

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

describe("useLinkedTicketData", () => {
  const boardTicket = { ...base, jiraStatus: "In Progress", title: "Live title", type: "story", readiness: "ready" } as unknown as Ticket;

  beforeEach(() => {
    detailState.data = undefined;
    detailState.key = null;
  });

  it("resolves from the board ticket without fetching, exposing live inline fields", () => {
    const { result } = renderHook(() => useLinkedTicketData("VPL-1", boardTicket, true));
    expect(detailState.key).toBeNull();
    expect(result.current.jiraStatus).toBe("In Progress");
    expect(result.current.title).toBe("Live title");
    expect(result.current.hoverData?.readiness).toBe("ready");
  });

  it("does not fetch until the row is primed (hovered)", () => {
    const { result } = renderHook(() => useLinkedTicketData("VPL-2", undefined, false));
    expect(detailState.key).toBeNull();
    expect(result.current.hoverData).toBeUndefined();
    expect(result.current.jiraStatus).toBeUndefined();
  });

  it("returns no live data while the primed fetch is still resolving", () => {
    const { result } = renderHook(() => useLinkedTicketData("VPL-3", undefined, true));
    expect(detailState.key).toBe("VPL-3");
    expect(result.current.hoverData).toBeUndefined();
    expect(result.current.jiraStatus).toBeUndefined();
  });

  it("builds from the fetched detail, deriving subtask counts and live fields", () => {
    detailState.data = {
      ...base,
      jiraStatus: "TEST",
      title: "Fetched title",
      readiness: "ready_for_refinement",
      subtasks: [
        { jiraStatus: "TO DO" },
        { jiraStatus: "Done" },
        { jiraStatus: "DEPRECATED" },
      ],
    };
    const { result } = renderHook(() => useLinkedTicketData("VPL-4", undefined, true));
    expect(result.current.jiraStatus).toBe("TEST");
    expect(result.current.title).toBe("Fetched title");
    expect(result.current.hoverData?.readiness).toBe("ready_for_refinement");
    expect(result.current.hoverData?.totalSubtaskCount).toBe(3);
    expect(result.current.hoverData?.openSubtaskCount).toBe(1);
    expect(result.current.hoverData?.sprintName).toBe("BT 1");
  });
});
