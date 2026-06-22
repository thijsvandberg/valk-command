import { render, act } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RefinementSessionProvider, useRefinementSession } from "./RefinementSessionContext";

const mockUpdate = vi.fn();
vi.mock("@/lib/api-client", () => ({
  refinementSessions: {
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

function TestConsumer({ onState }: { onState: (state: ReturnType<typeof useRefinementSession>) => void }) {
  const state = useRefinementSession();
  onState(state);
  return null;
}

function renderWithProvider(onState: (state: ReturnType<typeof useRefinementSession>) => void) {
  return render(
    <RefinementSessionProvider>
      <TestConsumer onState={onState} />
    </RefinementSessionProvider>,
  );
}

describe("RefinementSessionContext", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({});
  });

  it("starts with empty state", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    expect(state.queue).toEqual([]);
    expect(state.currentIndex).toBe(0);
    expect(state.sessionActive).toBe(false);
    expect(state.showingEndModal).toBe(false);
    expect(state.activeSidebarPanel).toBe(null);
  });

  it("starts a session with provided keys", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1", "VPL-2", "VPL-3"]); });

    expect(state.queue).toEqual(["VPL-1", "VPL-2", "VPL-3"]);
    expect(state.currentIndex).toBe(0);
    expect(state.sessionActive).toBe(true);
    expect(state.showingEndModal).toBe(false);
    expect(state.sessionStartedAt).toBeGreaterThan(0);
  });

  it("navigates forward and backward", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1", "VPL-2", "VPL-3"]); });
    expect(state.currentIndex).toBe(0);

    act(() => { state.nextTicket(); });
    expect(state.currentIndex).toBe(1);

    act(() => { state.nextTicket(); });
    expect(state.currentIndex).toBe(2);

    // Should not go beyond last index
    act(() => { state.nextTicket(); });
    expect(state.currentIndex).toBe(2);

    act(() => { state.prevTicket(); });
    expect(state.currentIndex).toBe(1);

    // Should not go below 0
    act(() => { state.goToTicket(0); });
    expect(state.currentIndex).toBe(0);
    act(() => { state.prevTicket(); });
    expect(state.currentIndex).toBe(0);
  });

  it("toggles sidebar panel with single-select behavior", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    expect(state.activeSidebarPanel).toBe(null);

    act(() => { state.toggleSidebarPanel("notes"); });
    expect(state.activeSidebarPanel).toBe("notes");

    act(() => { state.toggleSidebarPanel("chat"); });
    expect(state.activeSidebarPanel).toBe("chat");

    act(() => { state.toggleSidebarPanel("chat"); });
    expect(state.activeSidebarPanel).toBe(null);

    act(() => { state.toggleSidebarPanel("info"); });
    expect(state.activeSidebarPanel).toBe("info");

    act(() => { state.toggleSidebarPanel("subtasks"); });
    expect(state.activeSidebarPanel).toBe("subtasks");
  });

  it("collapses the sidebar when navigating to a different ticket", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1", "VPL-2", "VPL-3"]); });

    act(() => { state.toggleSidebarPanel("notes"); });
    expect(state.activeSidebarPanel).toBe("notes");

    act(() => { state.nextTicket(); });
    expect(state.currentIndex).toBe(1);
    expect(state.activeSidebarPanel).toBe(null);

    act(() => { state.toggleSidebarPanel("chat"); });
    expect(state.activeSidebarPanel).toBe("chat");

    act(() => { state.prevTicket(); });
    expect(state.currentIndex).toBe(0);
    expect(state.activeSidebarPanel).toBe(null);

    act(() => { state.toggleSidebarPanel("info"); });
    act(() => { state.goToTicket(2); });
    expect(state.currentIndex).toBe(2);
    expect(state.activeSidebarPanel).toBe(null);
  });

  it("keeps the sidebar open when navigation does not change the ticket", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1", "VPL-2"]); });
    act(() => { state.toggleSidebarPanel("notes"); });

    // Already at the first ticket; prevTicket is a no-op and must not collapse.
    act(() => { state.prevTicket(); });
    expect(state.currentIndex).toBe(0);
    expect(state.activeSidebarPanel).toBe("notes");

    // goToTicket to the current index is also a no-op.
    act(() => { state.goToTicket(0); });
    expect(state.activeSidebarPanel).toBe("notes");
  });

  it("opens and closes end modal", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1"]); });
    expect(state.showingEndModal).toBe(false);

    act(() => { state.openEndModal(); });
    expect(state.showingEndModal).toBe(true);
    expect(state.sessionActive).toBe(true);

    act(() => { state.closeEndModal(); });
    expect(state.showingEndModal).toBe(false);
    expect(state.sessionActive).toBe(true);
  });

  it("saves session without completing", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1"]); });
    act(() => { state.openEndModal(); });
    act(() => { state.saveSession(); });

    expect(state.sessionActive).toBe(false);
    expect(state.showingEndModal).toBe(false);
    expect(state.queue).toEqual(["VPL-1"]);
  });

  it("finishes session and marks completed", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1"]); });
    act(() => { state.openEndModal(); });
    act(() => { state.finishSession(); });

    expect(state.sessionActive).toBe(false);
    expect(state.showingEndModal).toBe(false);
    expect(state.queue).toEqual(["VPL-1"]);
  });

  it("saveSession PATCHes the session once with in_progress", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1", "VPL-2"], undefined, "sess-1", 1); });
    act(() => { state.saveSession("wrap-up note"); });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith("sess-1", {
      status: "in_progress",
      currentIndex: 1,
      generalComment: "wrap-up note",
    });
  });

  it("finishSession PATCHes the session once with completed", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1"], undefined, "sess-2"); });
    act(() => { state.finishSession(); });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith("sess-2", {
      status: "completed",
      currentIndex: 0,
    });
  });

  it("does not PATCH when there is no saved session id", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1"]); });
    act(() => { state.saveSession(); });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // Updaters must be pure: under StrictMode the setState updater runs twice. The PATCH
  // must still fire exactly once because it now lives outside the updater.
  it("fires exactly one PATCH under StrictMode", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    render(
      <StrictMode>
        <RefinementSessionProvider>
          <TestConsumer onState={(s) => { state = s; }} />
        </RefinementSessionProvider>
      </StrictMode>,
    );

    act(() => { state.startSession(["VPL-1"], undefined, "sess-3"); });
    act(() => { state.finishSession(); });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("records estimates per ticket, including cleared ones", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1", "VPL-2"]); });
    expect(state.sessionEstimates).toEqual({});

    act(() => { state.recordEstimate("VPL-1", 5); });
    act(() => { state.recordEstimate("VPL-2", 3); });
    expect(state.sessionEstimates).toEqual({ "VPL-1": 5, "VPL-2": 3 });

    act(() => { state.recordEstimate("VPL-1", null); });
    expect(state.sessionEstimates).toEqual({ "VPL-1": null, "VPL-2": 3 });
  });

  it("clears recorded estimates when a new session starts", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1"]); });
    act(() => { state.recordEstimate("VPL-1", 8); });
    expect(state.sessionEstimates).toEqual({ "VPL-1": 8 });

    act(() => { state.startSession(["VPL-2"]); });
    expect(state.sessionEstimates).toEqual({});
  });

  it("throws when used outside provider", () => {
    expect(() => {
      render(<TestConsumer onState={() => {}} />);
    }).toThrow("useRefinementSession must be used within RefinementSessionProvider");
  });
});
