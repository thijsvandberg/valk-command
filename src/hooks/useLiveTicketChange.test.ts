import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLiveTicketChange } from "./useLiveTicketChange";
import { publishTicketChange } from "@/lib/live-ticket-changes";
import { getClientId } from "@/lib/client-id";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLiveTicketChange", () => {
  it("flashes the changed kinds for a foreign change", () => {
    const { result } = renderHook(() => useLiveTicketChange("VPL-1"));

    act(() => {
      publishTicketChange({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"], origin: "other-tab" });
    });

    expect(result.current.has("status")).toBe(true);
  });

  it("stays silent for a change this tab originated", () => {
    const { result } = renderHook(() => useLiveTicketChange("VPL-1"));

    act(() => {
      publishTicketChange({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"], origin: getClientId() });
    });

    expect(result.current.size).toBe(0);
  });

  it("flashes for an originless (sync) change", () => {
    const { result } = renderHook(() => useLiveTicketChange("VPL-1"));

    act(() => {
      publishTicketChange({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["points"], origin: null });
    });

    expect(result.current.has("points")).toBe(true);
  });

  it("ignores changes to other tickets", () => {
    const { result } = renderHook(() => useLiveTicketChange("VPL-1"));

    act(() => {
      publishTicketChange({ type: "ticket:changed", ticketKey: "VPL-2", kinds: ["status"], origin: null });
    });

    expect(result.current.size).toBe(0);
  });

  it("clears the flash after the highlight window", () => {
    const { result } = renderHook(() => useLiveTicketChange("VPL-1"));

    act(() => {
      publishTicketChange({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"], origin: null });
    });
    act(() => { vi.advanceTimersByTime(1800); });

    expect(result.current.size).toBe(0);
  });
});
