import { render, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RefinementSessionProvider, useRefinementSession } from "./RefinementSessionContext";

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
  it("starts with empty state", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    expect(state.queue).toEqual([]);
    expect(state.currentIndex).toBe(0);
    expect(state.sessionActive).toBe(false);
    expect(state.notesCollapsed).toBe(true);
  });

  it("starts a session with provided keys", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1", "VPL-2", "VPL-3"]); });

    expect(state.queue).toEqual(["VPL-1", "VPL-2", "VPL-3"]);
    expect(state.currentIndex).toBe(0);
    expect(state.sessionActive).toBe(true);
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

  it("toggles notes panel", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    expect(state.notesCollapsed).toBe(true);
    act(() => { state.toggleNotes(); });
    expect(state.notesCollapsed).toBe(false);
    act(() => { state.toggleNotes(); });
    expect(state.notesCollapsed).toBe(true);
  });

  it("ends session", () => {
    let state!: ReturnType<typeof useRefinementSession>;
    renderWithProvider((s) => { state = s; });

    act(() => { state.startSession(["VPL-1"]); });
    expect(state.sessionActive).toBe(true);

    act(() => { state.endSession(); });
    expect(state.sessionActive).toBe(false);
    // Queue should still be available for summary
    expect(state.queue).toEqual(["VPL-1"]);
  });

  it("throws when used outside provider", () => {
    expect(() => {
      render(<TestConsumer onState={() => {}} />);
    }).toThrow("useRefinementSession must be used within RefinementSessionProvider");
  });
});
