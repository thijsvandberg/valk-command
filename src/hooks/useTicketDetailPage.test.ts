import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketDetail: vi.fn().mockReturnValue({ data: null, isLoading: false, mutate: vi.fn() }),
  useJiraSprints: vi.fn().mockReturnValue({ sprints: [] }),
  useTicketReviews: vi.fn().mockReturnValue({ data: null }),
  useActiveWriterSessions: vi.fn().mockReturnValue({ data: [], mutate: vi.fn() }),
}));

vi.mock("@/hooks/usePipelines", () => ({
  useFollowedTickets: vi.fn().mockReturnValue({ data: [] }),
  useFollowTicket: vi.fn().mockReturnValue({ follow: vi.fn(), unfollow: vi.fn() }),
}));

vi.mock("@/lib/api-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api-client")>();
  return {
    apiFetch: vi.fn().mockResolvedValue({}),
    jira: { syncTickets: vi.fn().mockResolvedValue({ count: 0 }) },
    tickets: {
      pushToJira: vi.fn().mockResolvedValue({ success: true }),
      toggleFlag: vi.fn().mockResolvedValue({}),
    },
    // Real ApiError so the hook's `err instanceof ApiError` check matches.
    ApiError: actual.ApiError,
  };
});

vi.mock("@/lib/ticket-cache", () => ({
  patchTicketCaches: vi.fn(),
  revalidateTicketCaches: vi.fn(),
}));

vi.mock("@/components/sprint-board/TicketTableCells", () => ({
  getJiraUrl: (key: string) => `https://jira.example.com/browse/${key}`,
}));

// Capture the live-event callback the hook registers (BRDG-338) so tests can
// drive ticket:changed events without the SSE layer.
const ticketEventCallbacks: Array<(event: unknown) => void> = [];
vi.mock("@/hooks/useTicketEvents", () => ({
  useTicketEvents: (_key: string | null, cb: (event: unknown) => void) => {
    ticketEventCallbacks.push(cb);
  },
}));

import { useTicketDetailPage } from "./useTicketDetailPage";
import { getClientId } from "@/lib/client-id";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { apiFetch, jira, tickets, ApiError } from "@/lib/api-client";
import { patchTicketCaches, revalidateTicketCaches } from "@/lib/ticket-cache";

const mockApiData = {
  key: "VPL-42",
  title: "Test ticket",
  type: "Story",
  jiraStatus: "TO DO",
  description: "A description",
  reporter: "alice",
  sprintId: "100",
  storyPoints: 3,
  flagged: false,
  readiness: null,
  poStatus: null,
  qualityScore: 80,
  editState: "clean",
  notes: "",
  assignee: "bob",
  parent: null,
  labels: [],
  components: [],
  priority: "Medium",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  attachments: [],
  subtasks: [],
  linkedIssues: [],
  jiraComments: [],
  epicChildren: [],
  // Widen to the real localEdits shape (Record<string, edit>) so tests can model
  // the "no local edits" state as `localEdits: {}` — the inferred literal type
  // would otherwise lock the key set to `description`.
  localEdits: {
    description: { value: "Pushed new description", isDraft: true, modifiedAt: "2026-06-12T10:00:00.000Z" },
  } as Record<string, { value: string; isDraft: boolean; modifiedAt: string }>,
};

const mutateFn = vi.fn().mockResolvedValue(undefined);

describe("useTicketDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketEventCallbacks.length = 0;
    vi.mocked(useTicketDetail).mockReturnValue({
      data: mockApiData,
      isLoading: false,
      mutate: mutateFn,
      isValidating: false,
      error: undefined,
    } as never);
    Object.defineProperty(navigator, "clipboard", {
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("maps API data to Ticket type correctly", () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
    expect(result.current.ticket).toBeTruthy();
    expect(result.current.ticket!.key).toBe("VPL-42");
    expect(result.current.ticket!.title).toBe("Test ticket");
    expect(result.current.ticket!.type).toBe("Story");
    expect(result.current.ticket!.jiraStatus).toBe("TO DO");
  });

  it("maps API data to TicketDetail type correctly", () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
    expect(result.current.detail).toBeTruthy();
    expect(result.current.detail!.description).toBe("A description");
    expect(result.current.detail!.reporter).toBe("alice");
  });

  it("auto-fetches from Jira when ticket not found locally", async () => {
    vi.mocked(useTicketDetail).mockReturnValue({
      data: null,
      isLoading: false,
      mutate: mutateFn,
      isValidating: false,
      error: undefined,
    } as never);

    renderHook(() => useTicketDetailPage("VPL-999"));

    await waitFor(() => expect(jira.syncTickets).toHaveBeenCalledWith(
      { ticketKeys: ["VPL-999"] },
      expect.any(AbortSignal),
    ));
  });

  it("push to Jira with success updates state", async () => {
    vi.mocked(tickets.pushToJira).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handlePushToJira(); });

    expect(tickets.pushToJira).toHaveBeenCalledWith("VPL-42");
    expect(result.current.isPushing).toBe(false);
    expect(result.current.pushError).toBeNull();
  });

  describe("effectiveTitle (BRDG-449)", () => {
    it("is the raw Jira title when there is no local title edit", () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      expect(result.current.effectiveTitle).toBe("Test ticket");
    });

    it("is the persisted local title draft when one exists in the payload", () => {
      vi.mocked(useTicketDetail).mockReturnValue({
        data: {
          ...mockApiData,
          localEdits: {
            ...mockApiData.localEdits,
            title: { value: "Persisted draft title", isDraft: true, modifiedAt: "2026-06-12T10:00:00.000Z" },
          },
        },
        isLoading: false,
        mutate: mutateFn,
        isValidating: false,
        error: undefined,
      } as never);

      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      expect(result.current.effectiveTitle).toBe("Persisted draft title");
    });

    it("reflects the live typed value the moment the editor reports it", () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      act(() => { result.current.handleTitleLocalEdit(true, "Live typed title"); });
      expect(result.current.effectiveTitle).toBe("Live typed title");
    });

    it("prefers the live typed value over the persisted draft", () => {
      vi.mocked(useTicketDetail).mockReturnValue({
        data: {
          ...mockApiData,
          localEdits: {
            ...mockApiData.localEdits,
            title: { value: "Persisted draft title", isDraft: true, modifiedAt: "2026-06-12T10:00:00.000Z" },
          },
        },
        isLoading: false,
        mutate: mutateFn,
        isValidating: false,
        error: undefined,
      } as never);

      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      act(() => { result.current.handleTitleLocalEdit(true, "Live typed title"); });
      expect(result.current.effectiveTitle).toBe("Live typed title");
    });

    it("clears the live title back to the Jira title on discard", async () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      act(() => { result.current.handleTitleLocalEdit(true, "Live typed title"); });
      expect(result.current.effectiveTitle).toBe("Live typed title");

      await act(async () => { await result.current.handleDiscardDraft(); });
      expect(result.current.effectiveTitle).toBe("Test ticket");
    });

    it("clears the live title on a successful push", async () => {
      vi.mocked(tickets.pushToJira).mockResolvedValue({ success: true });
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      act(() => { result.current.handleTitleLocalEdit(true, "Live typed title"); });
      expect(result.current.effectiveTitle).toBe("Live typed title");

      await act(async () => { await result.current.handlePushToJira(); });
      expect(result.current.liveTitleValue).toBeNull();
    });
  });

  it("surfaces the Jira content-limit reason in the toolbar banner (BRDG-349)", async () => {
    vi.mocked(tickets.pushToJira).mockRejectedValue(
      new ApiError(502, {
        error: "Failed to push to Jira",
        code: "JIRA_OPERATION_ERROR",
        detail: "Jira 400: description: CONTENT_LIMIT_EXCEEDED",
      }),
    );

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handlePushToJira(); });

    const friendly = "This description is too large for Jira. Trim it and try again.";
    expect(result.current.pushError).toBe(friendly);
    // The bottom-right failure toast is owned by the global ActivityToast, so the
    // hook must NOT also fire its own toast (would double-toast).
    expect(result.current.toast).toBeNull();
    expect(result.current.isPushing).toBe(false);
  });

  it("falls back to the raw Jira detail for an unmapped push failure (BRDG-349)", async () => {
    vi.mocked(tickets.pushToJira).mockRejectedValue(
      new ApiError(502, {
        error: "Failed to push to Jira",
        code: "JIRA_OPERATION_ERROR",
        detail: "Jira 403: you are not a project admin",
      }),
    );

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handlePushToJira(); });

    expect(result.current.pushError).toBe("Jira 403: you are not a project admin");
    expect(result.current.toast).toBeNull();
  });

  it("uses the error field when a failed push has no detail (BRDG-349)", async () => {
    vi.mocked(tickets.pushToJira).mockRejectedValue(
      new ApiError(400, { error: "This description is too large for Jira (max 32,767 characters)." }),
    );

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handlePushToJira(); });

    expect(result.current.pushError).toBe("This description is too large for Jira. Trim it and try again.");
  });

  it("draft-conflict reload revalidates and remounts the editors (BRDG-340)", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
    const keyBefore = result.current.draftDiscardKey;

    await act(async () => { await result.current.handleDraftConflictReload(); });

    expect(mutateFn).toHaveBeenCalled();
    expect(result.current.draftDiscardKey).toBe(keyBefore + 1);
    expect(result.current.editSaver).toBeDefined();
  });

  it("prefers the editor-provided pushed description over the cached local edit", async () => {
    vi.mocked(tickets.pushToJira).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handlePushToJira({ description: "Editor latest" }); });

    const optimisticCall = mutateFn.mock.calls.find((c) => typeof c[0] === "function");
    const updater = optimisticCall![0] as (prev: typeof mockApiData) => typeof mockApiData;
    expect(updater(mockApiData).description).toBe("Editor latest");
  });

  it("patches the editor's title into the cache on push so it does not flash back", async () => {
    vi.mocked(tickets.pushToJira).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    // The title editor reports its live value; the SWR localEdits payload has no
    // title entry (drafts are not tracked there), so the push must use this value.
    act(() => { result.current.handleTitleLocalEdit(true, "Editor title"); });
    await act(async () => { await result.current.handlePushToJira(); });

    const optimisticCall = mutateFn.mock.calls.find((c) => typeof c[0] === "function");
    const updater = optimisticCall![0] as (prev: typeof mockApiData) => typeof mockApiData;
    expect(updater(mockApiData).title).toBe("Editor title");
  });

  it("push to Jira optimistically clears the draft edit state", async () => {
    vi.mocked(tickets.pushToJira).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handlePushToJira(); });

    // The success path must patch the detail cache optimistically (not just
    // revalidate) so the "draft" badge clears even when the server cache is stale.
    const optimisticCall = mutateFn.mock.calls.find((c) => typeof c[0] === "function");
    expect(optimisticCall).toBeDefined();
    const updater = optimisticCall![0] as (prev: typeof mockApiData) => typeof mockApiData;
    const patched = updater({ ...mockApiData, editState: "local_edits" });
    expect(patched).toMatchObject({ editState: "clean", localEdits: {} });
    // The pushed content itself is patched in too, so the remounted editor
    // shows the new version instead of the stale cached one (BRDG-340).
    expect(patched.description).toBe("Pushed new description");
    // No immediate revalidation: a dev-mode refetch can return the stale
    // pre-push payload and clobber this patch (the old-version-until-refresh bug).
    expect(optimisticCall![1]).toMatchObject({ revalidate: false });
  });

  it("restore loads the version as a local edit without revalidating, and remounts (BRDG-440)", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
    const keyBefore = result.current.draftDiscardKey;

    await act(async () => { await result.current.handleRestored("Restored content"); });

    // The cache is patched client-side so the remounted editor shows the restored
    // content immediately, instead of the pre-restore state until a manual refresh.
    const optimisticCall = mutateFn.mock.calls.find((c) => typeof c[0] === "function");
    expect(optimisticCall).toBeDefined();
    const updater = optimisticCall![0] as (prev: typeof mockApiData) => typeof mockApiData;
    const patched = updater({ ...mockApiData, editState: "clean", localEdits: {} });
    expect(patched.editState).toBe("local_edits");
    expect(patched.localEdits.description).toMatchObject({ value: "Restored content", isDraft: false });
    // Same dev-mode-stale guard as push: do not revalidate immediately (BRDG-340).
    expect(optimisticCall![1]).toMatchObject({ revalidate: false });
    // Remount the editor so it reads the restored local edit.
    expect(result.current.draftDiscardKey).toBe(keyBefore + 1);
  });

  it("push to Jira does not clear draft state on conflict", async () => {
    vi.mocked(tickets.pushToJira).mockResolvedValue({ conflict: true, contentChanged: true });

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handlePushToJira(); });

    const cleansDraft = mutateFn.mock.calls.some(
      (c) => typeof c[0] === "function" && (c[0] as (p: typeof mockApiData) => typeof mockApiData)({ ...mockApiData, editState: "draft" }).editState === "clean",
    );
    expect(cleansDraft).toBe(false);
  });

  it("push to Jira with conflict shows diff", async () => {
    vi.mocked(tickets.pushToJira).mockResolvedValue({ conflict: true, contentChanged: true });

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handlePushToJira(); });

    expect(result.current.showConflictDiff).toBe(true);
  });

  it("discard draft clears all local edit state", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});

    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleDiscardDraft(); });

    expect(result.current.hasLocalTitleEdit).toBe(false);
    expect(result.current.hasLocalDescEdit).toBe(false);
    expect(result.current.pushError).toBeNull();
    expect(result.current.showConflictDiff).toBe(false);
  });

  it("refresh from Jira syncs fresh data", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleRefreshFromJira(); });

    expect(jira.syncTickets).toHaveBeenCalledWith({ ticketKeys: ["VPL-42"] });
    expect(mutateFn).toHaveBeenCalled();
    expect(result.current.isRefreshing).toBe(false);
  });

  it("flag toggle calls API and updates flagOverride", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleFlag(); });

    expect(tickets.toggleFlag).toHaveBeenCalledWith("VPL-42", true, undefined);
  });

  it("unflag calls API", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleUnflag(); });

    expect(tickets.toggleFlag).toHaveBeenCalledWith("VPL-42", false);
  });

  it("copy link to clipboard", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleCopyLink(); });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("VPL-42"),
    );
    expect(result.current.linkCopied).toBe(true);
  });

  it("readiness change: patches detail and list caches, then calls the API", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleReadinessChange("drafting"); });

    expect(patchTicketCaches).toHaveBeenCalledWith("VPL-42", { readiness: "drafting" });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/tickets/VPL-42/metadata",
      expect.objectContaining({ method: "PUT", body: { readiness: "drafting" } }),
    );
  });

  it("readiness change: revalidates ticket caches when the write fails", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleReadinessChange("drafting"); });

    expect(revalidateTicketCaches).toHaveBeenCalled();
  });

  it("Jira status change: optimistic update then API call", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleJiraStatusChange("IN PROGRESS"); });

    expect(mutateFn).toHaveBeenCalledWith(expect.any(Function), { revalidate: false });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/tickets/VPL-42/status",
      expect.objectContaining({ method: "PUT", body: { status: "IN PROGRESS" } }),
    );
  });

  it("type change calls PATCH and revalidates", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

    await act(async () => { await result.current.handleTypeChange("Bug" as never); });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/tickets/VPL-42",
      expect.objectContaining({ method: "PATCH", body: { type: "Bug" } }),
    );
    expect(mutateFn).toHaveBeenCalled();
  });

  describe("handleEpicChildPatch (BRDG-334)", () => {
    it("patches only the targeted child in epicChildren, without revalidating", () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

      act(() => { result.current.handleEpicChildPatch("VPL-50", { jiraStatus: "DONE" }); });

      expect(mutateFn).toHaveBeenCalledWith(expect.any(Function), { revalidate: false });
      const updater = mutateFn.mock.calls.at(-1)![0] as (prev: unknown) => { epicChildren: unknown[] };
      const next = updater({
        ...mockApiData,
        epicChildren: [
          { key: "VPL-50", jiraStatus: "TO DO", readiness: null },
          { key: "VPL-51", jiraStatus: "TO DO", readiness: null },
        ],
      });
      expect(next.epicChildren).toEqual([
        { key: "VPL-50", jiraStatus: "DONE", readiness: null },
        { key: "VPL-51", jiraStatus: "TO DO", readiness: null },
      ]);
    });

    it("merges arbitrary fields like readiness into the child row", () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

      act(() => { result.current.handleEpicChildPatch("VPL-50", { readiness: "drafting" }); });

      const updater = mutateFn.mock.calls.at(-1)![0] as (prev: unknown) => { epicChildren: { readiness: string | null }[] };
      const next = updater({ ...mockApiData, epicChildren: [{ key: "VPL-50", readiness: null }] });
      expect(next.epicChildren[0].readiness).toBe("drafting");
    });

    it("leaves the cache untouched when there is no data yet", () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

      act(() => { result.current.handleEpicChildPatch("VPL-50", { jiraStatus: "DONE" }); });

      const updater = mutateFn.mock.calls.at(-1)![0] as (prev: unknown) => unknown;
      expect(updater(undefined)).toBeUndefined();
    });
  });

  describe("live ticket events (BRDG-338)", () => {
    function fireEvent(kinds: string[], origin: string | null = null) {
      const cb = ticketEventCallbacks.at(-1)!;
      act(() => { cb({ type: "ticket:changed", ticketKey: "VPL-42", kinds, origin }); });
    }

    it("revalidates the detail payload when the ticket changes elsewhere", () => {
      renderHook(() => useTicketDetailPage("VPL-42"));
      mutateFn.mockClear();

      fireEvent(["comment"]);

      expect(mutateFn).toHaveBeenCalled();
    });

    it("highlights the changed kinds for a foreign change", () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));

      fireEvent(["status", "comment"]);

      expect(result.current.liveChangeKinds.has("status")).toBe(true);
      expect(result.current.liveChangeKinds.has("comment")).toBe(true);
    });

    it("ignores a change this tab originated: no revalidate, no highlight so the optimistic patch survives", () => {
      // A push/autosave echoes back as an own-origin event. Revalidating here
      // would refetch a stale dev payload and clobber the post-push patch (the
      // "title reverts until refresh" bug). Own writes are self-managed.
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      mutateFn.mockClear();

      fireEvent(["content"], getClientId());

      expect(mutateFn).not.toHaveBeenCalled();
      expect(result.current.liveChangeKinds.size).toBe(0);
      expect(result.current.showConflictDiff).toBe(false);
    });

    it("routes a content change during an active edit through the conflict warning (BRDG-243)", () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      act(() => { result.current.setIsDescEditing(true); });

      fireEvent(["content"]);

      expect(result.current.showConflictDiff).toBe(true);
    });

    it("refreshes silently for a content change when nothing is being edited", () => {
      const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
      mutateFn.mockClear();

      fireEvent(["content"]);

      expect(mutateFn).toHaveBeenCalled();
      expect(result.current.showConflictDiff).toBe(false);
    });
  });
});
