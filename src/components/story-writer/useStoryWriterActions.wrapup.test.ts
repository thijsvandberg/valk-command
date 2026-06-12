import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/useTicketEvents", () => ({ useTicketEvents: vi.fn() }));
vi.mock("@/hooks/useStoryWriter", () => ({ useStoryWriter: vi.fn() }));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/hooks/useOutsideClick", () => ({ useOutsideClick: vi.fn() }));

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock("swr", () => ({ mutate: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn().mockResolvedValue({}),
  jira: {},
  tickets: {
    get: vi.fn().mockResolvedValue({ title: "t" }),
    pullFromJira: vi.fn().mockResolvedValue({}),
    updateMetadata: vi.fn().mockResolvedValue({}),
  },
}));

import { useStoryWriterActions } from "./useStoryWriterActions";
import { tickets } from "@/lib/api-client";

const TICKET_KEY = "VPL-1";

function makeWriter(pushResult: { success: boolean; conflict: boolean; contentChanged: boolean }) {
  return {
    session: { localDraft: "draft body", localTitle: "Title", targetTicketKey: null },
    status: "ready",
    messages: [],
    aiDrafts: [],
    targetAiDrafts: [],
    relatedCandidates: [],
    outdated: false,
    targetOutdated: false,
    refreshSession: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    pushToJira: vi.fn().mockResolvedValue(pushResult),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    updateLocalDraft: vi.fn(),
    updateLocalTitle: vi.fn(),
    updateTargetLocalDraft: vi.fn(),
    updateTargetLocalTitle: vi.fn(),
  } as unknown as Parameters<typeof useStoryWriterActions>[0]["writer"];
}

function renderActions(writer: ReturnType<typeof makeWriter>) {
  return renderHook(() =>
    useStoryWriterActions({
      ticketKey: TICKET_KEY,
      writer,
      ticketData: { description: "jira body", title: "Title" },
      mutateTicket: vi.fn(),
      isDraft: false,
      isStillDraft: false,
      effectiveKey: TICKET_KEY,
    }),
  );
}

describe("useStoryWriterActions wrap-up flows (BRDG-339)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Ready to refine: pushes, sets readiness, keeps the session and defers navigation to the dialog", async () => {
    const writer = makeWriter({ success: true, conflict: false, contentChanged: false });
    const { result } = renderActions(writer);

    await act(async () => {
      await result.current.handleWrapUpReady();
    });

    expect(writer.pushToJira).toHaveBeenCalled();
    expect(tickets.updateMetadata).toHaveBeenCalledWith(TICKET_KEY, { readiness: "ready_to_refine" });
    expect(writer.deleteSession).not.toHaveBeenCalled();
    // Dialog opens instead of navigating right away.
    expect(result.current.showAddToRefinement).toBe(true);
    expect(routerPush).not.toHaveBeenCalled();

    // Closing the dialog (Skip or Add) completes the wrap-up.
    await act(async () => {
      result.current.handleAddToRefinementClose();
    });
    expect(result.current.showAddToRefinement).toBe(false);
    expect(routerPush).toHaveBeenCalledWith(`/tickets/${TICKET_KEY}`);
  });

  it("Ready to refine + clear session: additionally deletes the session", async () => {
    const writer = makeWriter({ success: true, conflict: false, contentChanged: false });
    const { result } = renderActions(writer);

    await act(async () => {
      await result.current.handleWrapUpReadyClear();
    });

    expect(writer.pushToJira).toHaveBeenCalled();
    expect(tickets.updateMetadata).toHaveBeenCalledWith(TICKET_KEY, { readiness: "ready_to_refine" });
    expect(writer.deleteSession).toHaveBeenCalledWith(true);
    expect(result.current.showAddToRefinement).toBe(true);
  });

  it("Close as-is: pushes and navigates without touching readiness or the session", async () => {
    const writer = makeWriter({ success: true, conflict: false, contentChanged: false });
    const { result } = renderActions(writer);

    await act(async () => {
      await result.current.handleWrapUpClose();
    });

    expect(writer.pushToJira).toHaveBeenCalled();
    expect(tickets.updateMetadata).not.toHaveBeenCalled();
    expect(writer.deleteSession).not.toHaveBeenCalled();
    expect(result.current.showAddToRefinement).toBe(false);
    expect(routerPush).toHaveBeenCalledWith(`/tickets/${TICKET_KEY}`);
  });

  it("a push conflict aborts the wrap-up: no readiness, no session delete, no navigation", async () => {
    const writer = makeWriter({ success: false, conflict: true, contentChanged: true });
    const { result } = renderActions(writer);

    await act(async () => {
      await result.current.handleWrapUpReadyClear();
    });

    expect(tickets.updateMetadata).not.toHaveBeenCalled();
    expect(writer.deleteSession).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
    expect(result.current.showAddToRefinement).toBe(false);
    expect(result.current.pushError).toMatch(/Jira was updated externally/);
  });

  it("nothing-to-push (success:false without conflict) still completes the wrap-up", async () => {
    const writer = makeWriter({ success: false, conflict: false, contentChanged: false });
    const { result } = renderActions(writer);

    await act(async () => {
      await result.current.handleWrapUpClose();
    });

    expect(routerPush).toHaveBeenCalledWith(`/tickets/${TICKET_KEY}`);
    expect(result.current.pushError).toBeNull();
  });

  it("plain push never changes readiness and never navigates", async () => {
    const writer = makeWriter({ success: true, conflict: false, contentChanged: false });
    const { result } = renderActions(writer);

    await act(async () => {
      await result.current.handlePush();
    });

    expect(writer.pushToJira).toHaveBeenCalled();
    expect(tickets.updateMetadata).not.toHaveBeenCalled();
    expect(writer.deleteSession).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
