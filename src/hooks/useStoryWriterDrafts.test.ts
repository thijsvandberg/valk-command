import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useStoryWriterDrafts } from "./useStoryWriterDrafts";
import type { StoryWriterSessionRow, StoryWriterDraftRow } from "@/db/schema";

const mockSession: StoryWriterSessionRow = {
  id: "session-1",
  ticketKey: "BRDG-100",
  conversationId: "conv-1",
  status: "active",
  localDraft: null,
  localTitle: null,
  baseVersionHash: null,
  targetTicketKey: null,
  targetLocalDraft: null,
  targetLocalTitle: null,
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
};

const API_BASE = "/api/tickets/BRDG-100/story-writer";
const TICKET_KEY = "BRDG-100";

type DraftOptions = Parameters<typeof useStoryWriterDrafts>[0];

function createOptions(overrides: Partial<{
  session: StoryWriterSessionRow | null;
  setSession: ReturnType<typeof vi.fn>;
  setAllDrafts: ReturnType<typeof vi.fn>;
  refreshSession: ReturnType<typeof vi.fn>;
}> = {}): DraftOptions {
  const sessionRef = { current: overrides.session ?? mockSession };
  const unmountedRef = { current: false };
  const setSession = overrides.setSession ?? vi.fn();
  const setAllDrafts = overrides.setAllDrafts ?? vi.fn();
  const refreshSession = overrides.refreshSession ?? vi.fn().mockResolvedValue(undefined);

  return {
    apiBase: API_BASE,
    ticketKey: TICKET_KEY,
    sessionRef,
    unmountedRef,
    setSession: setSession as unknown as DraftOptions["setSession"],
    setAllDrafts: setAllDrafts as unknown as DraftOptions["setAllDrafts"],
    refreshSession: refreshSession as unknown as DraftOptions["refreshSession"],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useStoryWriterDrafts", () => {
  describe("updateLocalDraft", () => {
    it("calls setSession with the new content", () => {
      const setSession = vi.fn();
      const opts = createOptions({ setSession });
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      act(() => {
        result.current.updateLocalDraft("new content");
      });

      expect(setSession).toHaveBeenCalled();
      const updater = setSession.mock.calls[0][0];
      const updated = updater(mockSession);
      expect(updated).toEqual({ ...mockSession, localDraft: "new content" });
    });

    it("does not update session when content is empty and localDraft exists", () => {
      const setSession = vi.fn();
      const opts = createOptions({
        setSession,
        session: { ...mockSession, localDraft: "existing" },
      });
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      act(() => {
        result.current.updateLocalDraft("");
      });

      expect(setSession).toHaveBeenCalled();
      const updater = setSession.mock.calls[0][0];
      const updated = updater({ ...mockSession, localDraft: "existing" });
      expect(updated).toEqual({ ...mockSession, localDraft: "existing" });
    });

    it("debounces PATCH and local-edit calls", async () => {
      vi.useFakeTimers();

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const opts = createOptions();
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      act(() => {
        result.current.updateLocalDraft("content");
      });

      expect(fetchSpy).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(fetchSpy).toHaveBeenCalledWith(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localDraft: "content" }),
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_KEY}/local-edits`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "description", localValue: "content", isDraft: true }),
        },
      );

      vi.useRealTimers();
    });
  });

  describe("acceptDraft", () => {
    it("PATCHes the session with acceptDraftId and updates session", async () => {
      const updatedSession = { ...mockSession, localDraft: "accepted content" };
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ session: updatedSession }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        } as Response);

      const setSession = vi.fn();
      const opts = createOptions({ setSession });
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      await act(async () => {
        await result.current.acceptDraft("draft-1");
      });

      expect(fetch).toHaveBeenCalledWith(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptDraftId: "draft-1" }),
      });
      expect(setSession).toHaveBeenCalledWith(updatedSession);
    });

    it("saves local edit for description when accepted draft has localDraft", async () => {
      const updatedSession = { ...mockSession, localDraft: "new description" };
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ session: updatedSession }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        } as Response);

      const opts = createOptions();
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      await act(async () => {
        await result.current.acceptDraft("draft-1");
      });

      expect(fetch).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_KEY}/local-edits`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "description", localValue: "new description", isDraft: true }),
        },
      );
    });

    it("does not update session when component is unmounted", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: mockSession }),
      } as Response);

      const setSession = vi.fn();
      const opts = createOptions({ setSession });
      opts.unmountedRef.current = true;
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      await act(async () => {
        await result.current.acceptDraft("draft-1");
      });

      expect(setSession).not.toHaveBeenCalled();
    });
  });

  describe("dismissDraft", () => {
    it("DELETEs the draft and removes it from state", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
      } as Response);

      const setAllDrafts = vi.fn();
      const opts = createOptions({ setAllDrafts });
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      await act(async () => {
        await result.current.dismissDraft("draft-1");
      });

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/apply-draft?draftId=draft-1`,
        { method: "DELETE" },
      );
      expect(setAllDrafts).toHaveBeenCalled();

      const filterFn = setAllDrafts.mock.calls[0][0];
      const filtered = filterFn([
        { id: "draft-1" } as StoryWriterDraftRow,
        { id: "draft-2" } as StoryWriterDraftRow,
      ]);
      expect(filtered).toEqual([{ id: "draft-2" }]);
    });
  });

  describe("pushToJira", () => {
    it("returns early when no drafts exist", async () => {
      vi.spyOn(global, "fetch");
      const opts = createOptions();
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      let pushResult;
      await act(async () => {
        pushResult = await result.current.pushToJira(mockSession);
      });

      expect(pushResult).toEqual({ success: false, conflict: false, contentChanged: false });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("pushes original ticket to Jira when localDraft exists", async () => {
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response);

      const refreshSession = vi.fn().mockResolvedValue(undefined);
      const opts = createOptions({ refreshSession });
      const sessionWithDraft = { ...mockSession, localDraft: "updated desc" };

      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      let pushResult;
      await act(async () => {
        pushResult = await result.current.pushToJira(sessionWithDraft);
      });

      expect(pushResult).toEqual({ success: true, conflict: false, contentChanged: false });
      expect(fetch).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_KEY}/push-to-jira`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      expect(refreshSession).toHaveBeenCalled();
    });

    it("pushes both original and target when both have drafts", async () => {
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response);

      const refreshSession = vi.fn().mockResolvedValue(undefined);
      const opts = createOptions({ refreshSession });
      const sessionWithBothDrafts: StoryWriterSessionRow = {
        ...mockSession,
        localDraft: "original desc",
        targetTicketKey: "BRDG-200",
        targetLocalDraft: "target desc",
      };

      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      let pushResult;
      await act(async () => {
        pushResult = await result.current.pushToJira(sessionWithBothDrafts);
      });

      expect(pushResult).toEqual({ success: true, conflict: false, contentChanged: false });
      expect(fetch).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_KEY}/push-to-jira`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetch).toHaveBeenCalledWith(
        `/api/tickets/BRDG-200/push-to-jira`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns failure result when original push fails", async () => {
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: false, conflict: true, contentChanged: false }),
        } as Response);

      const opts = createOptions();
      const sessionWithDraft = { ...mockSession, localDraft: "updated" };

      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      let pushResult;
      await act(async () => {
        pushResult = await result.current.pushToJira(sessionWithDraft);
      });

      expect(pushResult).toEqual({ success: false, conflict: true, contentChanged: false });
    });
  });

  describe("saveDraft", () => {
    it("saves local edits for all populated fields", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const opts = createOptions();
      const sessionWithAll: StoryWriterSessionRow = {
        ...mockSession,
        localDraft: "desc",
        localTitle: "title",
        targetTicketKey: "BRDG-200",
        targetLocalDraft: "target desc",
        targetLocalTitle: "target title",
      };

      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      await act(async () => {
        await result.current.saveDraft(sessionWithAll);
      });

      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_KEY}/local-edits`,
        expect.objectContaining({
          body: JSON.stringify({ field: "description", localValue: "desc", isDraft: false }),
        }),
      );
      expect(fetch).toHaveBeenCalledWith(
        `/api/tickets/${TICKET_KEY}/local-edits`,
        expect.objectContaining({
          body: JSON.stringify({ field: "title", localValue: "title", isDraft: false }),
        }),
      );
      expect(fetch).toHaveBeenCalledWith(
        `/api/tickets/BRDG-200/local-edits`,
        expect.objectContaining({
          body: JSON.stringify({ field: "description", localValue: "target desc", isDraft: false }),
        }),
      );
      expect(fetch).toHaveBeenCalledWith(
        `/api/tickets/BRDG-200/local-edits`,
        expect.objectContaining({
          body: JSON.stringify({ field: "title", localValue: "target title", isDraft: false }),
        }),
      );
    });

    it("does nothing when session is null", async () => {
      vi.spyOn(global, "fetch");
      const opts = createOptions();
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      await act(async () => {
        await result.current.saveDraft(null);
      });

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("clearTimers", () => {
    it("can be called without error", () => {
      const opts = createOptions();
      const { result } = renderHook(() => useStoryWriterDrafts(opts));

      expect(() => result.current.clearTimers()).not.toThrow();
    });
  });
});
