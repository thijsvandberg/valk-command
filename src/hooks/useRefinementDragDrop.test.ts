import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useRefinementDragDrop,
  SESSION_DROP_PREFIX,
  PLAN_SESSION_DROP_ID,
  NEW_SESSION_HINT_ID,
  ticketDragId,
} from "./useRefinementDragDrop";
import type { RefinementSessionResponse } from "@/lib/api-client";
import type { DragEndEvent, DragStartEvent, DragOverEvent } from "@dnd-kit/core";

function makeSession(overrides: Partial<RefinementSessionResponse>): RefinementSessionResponse {
  return {
    id: "s1",
    name: "Sprint 42",
    ticketKeys: [],
    ticketCount: 0,
    status: "draft",
    generalComment: null,
    scheduledFor: null,
    currentIndex: 0,
    createdAt: "2026-06-01T10:00:00Z",
    updatedAt: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

const sessions: RefinementSessionResponse[] = [
  makeSession({ id: "s1", name: "Sprint 42", ticketKeys: ["VPL-1"], ticketCount: 1 }),
  makeSession({ id: "s2", name: "Sprint 43", ticketKeys: ["VPL-9"], ticketCount: 1, status: "in_progress" }),
  makeSession({ id: "s3", name: "Done one", ticketKeys: ["VPL-5"], ticketCount: 1, status: "completed" }),
];

function dragEndEvent(ticketKey: string | undefined, overId: string | null): DragEndEvent {
  return {
    active: { id: ticketKey ? ticketDragId("list", ticketKey) : "x", data: { current: ticketKey ? { ticketKey } : {} } },
    over: overId ? { id: overId } : null,
  } as unknown as DragEndEvent;
}

describe("useRefinementDragDrop", () => {
  let onMove: (ticketKey: string, targetSessionId: string) => void;
  let onCreateFromTicket: (ticketKey: string) => void;
  let onAlreadyInSession: (ticketKey: string, session: RefinementSessionResponse) => void;

  beforeEach(() => {
    onMove = vi.fn();
    onCreateFromTicket = vi.fn();
    onAlreadyInSession = vi.fn();
  });

  function setup() {
    return renderHook(() =>
      useRefinementDragDrop({ sessions, onMove, onCreateFromTicket, onAlreadyInSession }),
    );
  }

  it("moves the ticket when dropped on another session", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragEnd(dragEndEvent("VPL-2", `${SESSION_DROP_PREFIX}s2`));
    });
    expect(onMove).toHaveBeenCalledWith("VPL-2", "s2");
    expect(onCreateFromTicket).not.toHaveBeenCalled();
    expect(onAlreadyInSession).not.toHaveBeenCalled();
  });

  it("treats a drop on a session that already holds the ticket as a no-op with feedback", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragEnd(dragEndEvent("VPL-1", `${SESSION_DROP_PREFIX}s1`));
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(onAlreadyInSession).toHaveBeenCalledWith("VPL-1", expect.objectContaining({ id: "s1", name: "Sprint 42" }));
  });

  it("rejects drops on completed sessions", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragEnd(dragEndEvent("VPL-2", `${SESSION_DROP_PREFIX}s3`));
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(onAlreadyInSession).not.toHaveBeenCalled();
  });

  it("rejects drops on unknown sessions", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragEnd(dragEndEvent("VPL-2", `${SESSION_DROP_PREFIX}nope`));
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("creates a new session when dropped on the Plan session target", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragEnd(dragEndEvent("VPL-2", PLAN_SESSION_DROP_ID));
    });
    expect(onCreateFromTicket).toHaveBeenCalledWith("VPL-2");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does nothing when dropped outside any target", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragEnd(dragEndEvent("VPL-2", null));
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(onCreateFromTicket).not.toHaveBeenCalled();
  });

  it("does nothing when the drag carries no ticket key", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragEnd(dragEndEvent(undefined, `${SESSION_DROP_PREFIX}s2`));
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("tracks the active drag key from drag start to drag end", () => {
    const { result } = setup();
    expect(result.current.isDragActive).toBe(false);

    act(() => {
      result.current.handleDragStart({
        active: { id: ticketDragId("list", "VPL-2"), data: { current: { ticketKey: "VPL-2" } } },
      } as unknown as DragStartEvent);
    });
    expect(result.current.activeDragKey).toBe("VPL-2");
    expect(result.current.isDragActive).toBe(true);

    act(() => {
      result.current.handleDragEnd(dragEndEvent("VPL-2", null));
    });
    expect(result.current.activeDragKey).toBeNull();
    expect(result.current.isDragActive).toBe(false);
  });

  it("resets state on drag cancel", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragStart({
        active: { id: ticketDragId("panel", "VPL-2"), data: { current: { ticketKey: "VPL-2" } } },
      } as unknown as DragStartEvent);
      result.current.handleDragOver({ over: { id: `${SESSION_DROP_PREFIX}s2` } } as unknown as DragOverEvent);
    });
    expect(result.current.overSessionId).toBe("s2");

    act(() => {
      result.current.handleDragCancel();
    });
    expect(result.current.activeDragKey).toBeNull();
    expect(result.current.overSessionId).toBeNull();
  });

  it("maps the Plan session target to the new-session hint id", () => {
    const { result } = setup();
    act(() => {
      result.current.handleDragOver({ over: { id: PLAN_SESSION_DROP_ID } } as unknown as DragOverEvent);
    });
    expect(result.current.overSessionId).toBe(NEW_SESSION_HINT_ID);
  });
});
