import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ticket } from "@/types/ticket";
import { useTestDocBoard } from "./useTestDocBoard";
import { shouldAutoEnableTestDocTag } from "@/components/sprint-board/sprint-board-utils";

// The hook reads localStorage-backed marker state and a provider-bound SWR
// mutate in its constructor; stub both so the tests exercise only the BRDG-463
// confirm gate in openTestDocQueue.
vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api-client", () => ({
  tickets: { generateTestDoc: vi.fn(), getTestDoc: vi.fn() },
}));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  shouldAutoEnableTestDocTag: vi.fn(() => false),
  readTestDocTagSprints: vi.fn(() => new Set<string>()),
  persistTestDocTagSprints: vi.fn(),
}));

type TestDocState = NonNullable<Ticket["testDocState"]>;

function makeTicket(key: string, testDocState: TestDocState | null, jiraStatus = "DONE"): Ticket {
  return { key, title: key, jiraStatus, testDocState } as Ticket;
}

function setup(allTickets: Ticket[]) {
  const showToast = vi.fn();
  const { result } = renderHook(() =>
    useTestDocBoard({
      isAllView: true,
      activeSprint: null,
      remainingWorkDays: null,
      visibleTags: new Set(),
      toggleColumn: vi.fn(),
      allTickets,
      showToast,
    }),
  );
  return { result, showToast };
}

describe("useTestDocBoard - BRDG-463 not-needed confirm gate", () => {
  beforeEach(() => {
    vi.mocked(shouldAutoEnableTestDocTag).mockReturnValue(false);
  });

  it("opens the confirm gate instead of queueing when the selection includes a not-needed ticket", () => {
    const { result } = setup([
      makeTicket("A", null),
      makeTicket("B", "not_needed"),
      makeTicket("C", "accepted"),
    ]);

    act(() => result.current.openTestDocQueue(["A", "B", "C"]));

    expect(result.current.testDocQueue).toBeNull();
    expect(result.current.testDocConfirm).not.toBeNull();
    expect(result.current.testDocConfirm?.eligible).toEqual(["A", "B", "C"]);
    expect(result.current.testDocConfirm?.notNeededKeys).toEqual(["B"]);
    // The gate also carries the resolved ticket objects for the list rows.
    expect(result.current.testDocConfirm?.notNeeded.map((t) => t.key)).toEqual(["B"]);
  });

  it("regenerates only the tickets that were not marked not-needed by default", () => {
    const { result } = setup([
      makeTicket("A", null),
      makeTicket("B", "not_needed"),
      makeTicket("C", "accepted"),
    ]);

    act(() => result.current.openTestDocQueue(["A", "B", "C"]));
    act(() => result.current.confirmTestDocProceed([]));

    expect(result.current.testDocConfirm).toBeNull();
    expect(result.current.testDocQueue?.keys).toEqual(["A", "C"]);
    expect(result.current.testDocQueue?.autoGenerate).toBe(true);
  });

  it("regenerates a not-needed ticket too when it is ticked back in", () => {
    const { result } = setup([
      makeTicket("A", null),
      makeTicket("B", "not_needed"),
    ]);

    act(() => result.current.openTestDocQueue(["A", "B"]));
    act(() => result.current.confirmTestDocProceed(["B"]));

    expect(result.current.testDocConfirm).toBeNull();
    expect(result.current.testDocQueue?.keys).toEqual(["A", "B"]);
  });

  it("skips the unticked not-needed tickets and includes only the ticked ones", () => {
    const { result } = setup([
      makeTicket("A", null),
      makeTicket("B", "not_needed"),
      makeTicket("D", "not_needed"),
    ]);

    act(() => result.current.openTestDocQueue(["A", "B", "D"]));
    act(() => result.current.confirmTestDocProceed(["B"]));

    expect(result.current.testDocQueue?.keys).toEqual(["A", "B"]);
  });

  it("cancel closes the gate and queues nothing", () => {
    const { result } = setup([makeTicket("A", null), makeTicket("B", "not_needed")]);

    act(() => result.current.openTestDocQueue(["A", "B"]));
    act(() => result.current.cancelTestDocConfirm());

    expect(result.current.testDocConfirm).toBeNull();
    expect(result.current.testDocQueue).toBeNull();
  });

  it("queues immediately with no gate when no ticket is marked not-needed", () => {
    const { result } = setup([makeTicket("A", null), makeTicket("C", "accepted")]);

    act(() => result.current.openTestDocQueue(["A", "C"]));

    expect(result.current.testDocConfirm).toBeNull();
    expect(result.current.testDocQueue?.keys).toEqual(["A", "C"]);
  });

  it("never shows the gate for a view-only open (autoGenerate false)", () => {
    const { result } = setup([makeTicket("B", "not_needed")]);

    act(() => result.current.openTestDocQueue(["B"], { autoGenerate: false }));

    expect(result.current.testDocConfirm).toBeNull();
    expect(result.current.testDocQueue?.keys).toEqual(["B"]);
    expect(result.current.testDocQueue?.autoGenerate).toBe(false);
  });

  it("shows the gate even for a single not-needed ticket", () => {
    const { result } = setup([makeTicket("B", "not_needed")]);

    act(() => result.current.openTestDocQueue(["B"]));

    expect(result.current.testDocConfirm?.notNeededKeys).toEqual(["B"]);
    expect(result.current.testDocQueue).toBeNull();
  });

  it("queues nothing and toasts when the whole selection is not-needed and none are ticked", () => {
    const { result, showToast } = setup([
      makeTicket("B", "not_needed"),
      makeTicket("D", "not_needed"),
    ]);

    act(() => result.current.openTestDocQueue(["B", "D"]));
    act(() => result.current.confirmTestDocProceed([]));

    expect(result.current.testDocConfirm).toBeNull();
    expect(result.current.testDocQueue).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});
