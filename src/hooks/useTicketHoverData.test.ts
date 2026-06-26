import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";
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

import { buildTicketHoverData, useLinkedTicketData, useHoverData, useTicketHoverData, HoverDataProvider } from "./useTicketHoverData";

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

function swrWrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

describe("useHoverData (BRDG-412)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches hover data for the bounded keys via /api/tickets/hover", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ "VPL-1": { title: "One" }, "VPL-2": { title: "Two" } }),
    } as Response);

    const { result } = renderHook(() => useHoverData(["VPL-2", "VPL-1"]), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current("VPL-1")).toBeDefined());
    expect(result.current("VPL-1")!.title).toBe("One");
    expect(result.current("VPL-2")!.title).toBe("Two");

    // One bounded request, with the keys sorted in the URL (stable SWR key).
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain("/api/tickets/hover?keys=VPL-1,VPL-2");
  });

  it("does not fetch when there are no keys", () => {
    vi.spyOn(global, "fetch");

    const { result } = renderHook(() => useHoverData([]), { wrapper: swrWrapper });

    expect(result.current("VPL-1")).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("feeds useTicketHoverData consumers through HoverDataProvider", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ "VPL-9": { title: "Nine" } }),
    } as Response);

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        createElement(HoverDataProvider, { keys: ["VPL-9"] }, children),
      );

    const { result } = renderHook(() => useTicketHoverData(), { wrapper });

    await waitFor(() => expect(result.current("VPL-9")).toBeDefined());
    expect(result.current("VPL-9")!.title).toBe("Nine");
  });

  it("useTicketHoverData returns undefined for every key without a provider", () => {
    const { result } = renderHook(() => useTicketHoverData());
    expect(result.current("VPL-1")).toBeUndefined();
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
