import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ticket } from "@/types/ticket";
import { useTicketActions } from "./useTicketActions";

const toggleFlag = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  jira: {},
  tickets: { toggleFlag: (...args: unknown[]) => toggleFlag(...args) },
}));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  saveTicketMetadata: vi.fn(),
  saveStoryPoints: vi.fn(),
}));

function makeTicket(key: string, flagged: boolean): Ticket {
  return {
    key, title: key, type: "story", epicKey: null, flagged,
    jiraStatus: "TO DO", storyPoints: null, businessValue: null,
    assignee: null, epic: null, sprintId: null, qualityScore: null,
    readiness: null, poStatus: "Draft", editState: "clean", notes: "",
  } as Ticket;
}

describe("useTicketActions - handleBulkSetFlagged", () => {
  beforeEach(() => {
    toggleFlag.mockReset();
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ apiTickets, mutateTickets, activeListKey: null, showToast }),
    );
    return { result, mutateTickets, showToast };
  }

  it("flags all targets and posts the reason, then toasts success", async () => {
    toggleFlag.mockResolvedValue({ flagged: true });
    const { result, mutateTickets, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(true, "blocked by API", new Set(["A-1", "A-2"]));
    });

    expect(toggleFlag).toHaveBeenCalledTimes(2);
    expect(toggleFlag).toHaveBeenCalledWith("A-1", true, "blocked by API");
    expect(toggleFlag).toHaveBeenCalledWith("A-2", true, "blocked by API");
    // Optimistic write
    expect(mutateTickets).toHaveBeenCalled();
    expect(showToast).toHaveBeenLastCalledWith("Flagged 2 tickets");
  });

  it("passes undefined reason when none is given", async () => {
    toggleFlag.mockResolvedValue({ flagged: true });
    const { result } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(true, null, new Set(["A-1"]));
    });

    expect(toggleFlag).toHaveBeenCalledWith("A-1", true, undefined);
  });

  it("unflags and toasts the singular success message", async () => {
    toggleFlag.mockResolvedValue({ flagged: false });
    const { result, showToast } = setup([makeTicket("A-1", true)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(false, null, new Set(["A-1"]));
    });

    expect(toggleFlag).toHaveBeenCalledWith("A-1", false, undefined);
    expect(showToast).toHaveBeenLastCalledWith("Unflagged 1 ticket");
  });

  it("reverts and reports failure when a request rejects", async () => {
    toggleFlag.mockRejectedValue(new Error("boom"));
    const { result, mutateTickets, showToast } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(true, null, new Set(["A-1"]));
    });

    // Optimistic write + revert write
    expect(mutateTickets.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(showToast).toHaveBeenLastCalledWith("Failed to flag 1 ticket");
  });
});
