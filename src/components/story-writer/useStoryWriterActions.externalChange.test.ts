import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the callback the hook registers with useTicketEvents so we can drive
// an external "content:changed" event directly, without the SSE layer.
const ticketEventCallbacks: Array<(...args: unknown[]) => void> = [];
vi.mock("@/hooks/useTicketEvents", () => ({
  useTicketEvents: (_key: string | null, cb: (...args: unknown[]) => void) => {
    ticketEventCallbacks.push(cb);
  },
}));

vi.mock("@/hooks/useStoryWriter", () => ({ useStoryWriter: vi.fn() }));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ notify: vi.fn() }) }));
vi.mock("@/hooks/useOutsideClick", () => ({ useOutsideClick: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("swr", () => ({ mutate: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn().mockResolvedValue({}),
  jira: {},
  tickets: {
    get: vi.fn().mockResolvedValue({ title: "t" }),
    pullFromJira: vi.fn().mockResolvedValue({ description: "fresh from jira", title: "Fresh" }),
    updateMetadata: vi.fn().mockResolvedValue({}),
  },
}));

import { useStoryWriterActions } from "./useStoryWriterActions";
import { tickets, apiFetch } from "@/lib/api-client";

const TICKET_KEY = "VPL-1";

function makeWriter(localDraft: string) {
  return {
    session: { localDraft, localTitle: "Some title", targetTicketKey: null },
    status: "ready",
    messages: [],
    aiDrafts: [],
    targetAiDrafts: [],
    relatedCandidates: [],
    outdated: true,
    targetOutdated: false,
    refreshSession: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    updateLocalDraft: vi.fn(),
    updateLocalTitle: vi.fn(),
    updateTargetLocalDraft: vi.fn(),
    updateTargetLocalTitle: vi.fn(),
  } as unknown as Parameters<typeof useStoryWriterActions>[0]["writer"];
}

function renderActions(localDraft: string, ticketDescription: string, mutateTicket = vi.fn()) {
  const writer = makeWriter(localDraft);
  renderHook(() =>
    useStoryWriterActions({
      ticketKey: TICKET_KEY,
      writer,
      ticketData: { description: ticketDescription, title: "Some title" },
      mutateTicket,
      isDraft: false,
      isStillDraft: false,
      effectiveKey: TICKET_KEY,
    }),
  );
  return { writer, mutateTicket };
}

describe("useStoryWriterActions external content change", () => {
  beforeEach(() => {
    ticketEventCallbacks.length = 0;
    vi.clearAllMocks();
  });

  it("clean draft follows the new Jira version", async () => {
    // localDraft equals the Jira description -> untouched draft -> clean.
    renderActions("same body", "same body");
    const cb = ticketEventCallbacks.at(-1)!;
    cb();

    await waitFor(() => expect(tickets.pullFromJira).toHaveBeenCalledWith(TICKET_KEY));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("/story-writer"),
        expect.objectContaining({ method: "PATCH", body: { rebaseBaseline: true } }),
      ),
    );
  });

  it("dirty draft is preserved and only the banner is re-evaluated", async () => {
    // localDraft diverges from the Jira description -> the PO has own work.
    const { writer, mutateTicket } = renderActions("my own edits", "original jira body");
    const cb = ticketEventCallbacks.at(-1)!;
    cb();

    await waitFor(() => expect(writer.refreshSession).toHaveBeenCalled());
    expect(mutateTicket).toHaveBeenCalled();
    expect(tickets.pullFromJira).not.toHaveBeenCalled();
  });
});
