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

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  jira: { syncTickets: vi.fn().mockResolvedValue({ count: 0 }) },
  tickets: {
    pushToJira: vi.fn().mockResolvedValue({ success: true }),
    toggleFlag: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/ticket-cache", () => ({
  patchTicketCaches: vi.fn(),
  revalidateTicketCaches: vi.fn(),
}));

vi.mock("@/components/sprint-board/TicketTableCells", () => ({
  getJiraUrl: (key: string) => `https://jira.example.com/browse/${key}`,
}));

import { useTicketDetailPage } from "./useTicketDetailPage";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { apiFetch, jira, tickets } from "@/lib/api-client";
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
  localEdits: {
    description: { value: "Pushed new description", isDraft: true, modifiedAt: "2026-06-12T10:00:00.000Z" },
  },
};

const mutateFn = vi.fn().mockResolvedValue(undefined);

describe("useTicketDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("draft-conflict reload revalidates and remounts the editors (BRDG-340)", async () => {
    const { result } = renderHook(() => useTicketDetailPage("VPL-42"));
    const keyBefore = result.current.draftDiscardKey;

    await act(async () => { await result.current.handleDraftConflictReload(); });

    expect(mutateFn).toHaveBeenCalled();
    expect(result.current.draftDiscardKey).toBe(keyBefore + 1);
    expect(result.current.editSaver).toBeDefined();
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
    expect(optimisticCall![1]).toMatchObject({ revalidate: true });
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
});
