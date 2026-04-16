"use client";

import { useCallback, useRef } from "react";
import { mutate as globalMutate } from "swr";
import type { StoryWriterSessionRow, StoryWriterDraftRow } from "@/db/schema";
import { storyWriter as storyWriterApi, tickets as ticketsApi, apiFetch, ApiError } from "@/lib/api-client";

interface DraftOptions {
  apiBase: string;
  ticketKey: string;
  sessionRef: React.RefObject<StoryWriterSessionRow | null>;
  unmountedRef: React.RefObject<boolean>;
  setSession: (v: StoryWriterSessionRow | null | ((prev: StoryWriterSessionRow | null) => StoryWriterSessionRow | null)) => void;
  setAllDrafts: React.Dispatch<React.SetStateAction<StoryWriterDraftRow[]>>;
  refreshSession: () => Promise<void>;
}

function patchSession(ticketKey: string, data: Record<string, unknown>) {
  return storyWriterApi.patchSession(ticketKey, data);
}

function saveLocalEdit(ticketKey: string, field: string, value: string, isDraft = true) {
  return apiFetch(`/api/tickets/${encodeURIComponent(ticketKey)}/local-edits`, {
    method: "PUT",
    body: { field, localValue: value, isDraft },
  });
}

export function useStoryWriterDrafts(options: DraftOptions) {
  const { ticketKey, sessionRef, unmountedRef, setSession, setAllDrafts, refreshSession } = options;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetTitleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    if (targetSaveTimerRef.current) clearTimeout(targetSaveTimerRef.current);
    if (targetTitleSaveTimerRef.current) clearTimeout(targetTitleSaveTimerRef.current);
  }, []);

  const updateLocalDraft = useCallback((content: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (!content && prev.localDraft) return prev;
      if (content === prev.localDraft) return prev;
      return { ...prev, localDraft: content };
    });

    if (!content) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await patchSession(ticketKey, { localDraft: content });
        await saveLocalEdit(ticketKey, "description", content);
      } catch { /* ignore */ }
    }, 500);
  }, [ticketKey, setSession]);

  const updateTargetLocalDraft = useCallback((content: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (!content && prev.targetLocalDraft) return prev;
      if (content === prev.targetLocalDraft) return prev;
      return { ...prev, targetLocalDraft: content };
    });

    if (!content) return;
    if (targetSaveTimerRef.current) clearTimeout(targetSaveTimerRef.current);
    targetSaveTimerRef.current = setTimeout(async () => {
      try {
        await patchSession(ticketKey, { targetLocalDraft: content });
      } catch { /* ignore */ }
    }, 500);
  }, [ticketKey, setSession]);

  const updateLocalTitle = useCallback((title: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (title === prev.localTitle) return prev;
      return { ...prev, localTitle: title };
    });

    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(async () => {
      try {
        await patchSession(ticketKey, { localTitle: title });
        await saveLocalEdit(ticketKey, "title", title);
      } catch { /* ignore */ }
    }, 500);
  }, [ticketKey, setSession]);

  const updateTargetLocalTitle = useCallback((title: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (title === prev.targetLocalTitle) return prev;
      return { ...prev, targetLocalTitle: title };
    });

    if (targetTitleSaveTimerRef.current) clearTimeout(targetTitleSaveTimerRef.current);
    targetTitleSaveTimerRef.current = setTimeout(async () => {
      try {
        const targetKey = sessionRef.current?.targetTicketKey ?? null;
        if (!targetKey) return;
        await patchSession(ticketKey, { targetLocalTitle: title });
        await saveLocalEdit(targetKey, "title", title);
      } catch { /* ignore */ }
    }, 500);
  }, [ticketKey, sessionRef, setSession]);

  const acceptDraft = useCallback(async (draftId: string) => {
    try {
      const data = await patchSession(ticketKey, { acceptDraftId: draftId }) as { session: StoryWriterSessionRow };
      const updated = data.session;
      if (!unmountedRef.current) setSession(updated);
      if (updated?.localDraft) {
        await saveLocalEdit(ticketKey, "description", updated.localDraft);
      }
    } catch { /* ignore */ }
  }, [ticketKey, setSession, unmountedRef]);

  const dismissDraft = useCallback(async (draftId: string) => {
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(ticketKey)}/story-writer/apply-draft?draftId=${draftId}`, { method: "DELETE" });
      if (!unmountedRef.current) {
        setAllDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
    } catch { /* ignore */ }
  }, [ticketKey, unmountedRef, setAllDrafts]);

  const saveDraft = useCallback(async (session: StoryWriterSessionRow | null) => {
    if (!session) return;
    const saves: Promise<unknown>[] = [];
    // Flush localDraft and localTitle to the session row so that refreshSession()
    // after a push (or after a failed push + page reload) always returns the current
    // values. Without this, the patchSession debounce in updateLocalDraft/updateLocalTitle
    // may not have fired yet, leaving the session DB stale.
    const sessionPatch: Record<string, string> = {};
    if (session.localDraft) {
      saves.push(saveLocalEdit(ticketKey, "description", session.localDraft, false));
      sessionPatch.localDraft = session.localDraft;
    }
    if (session.localTitle) {
      saves.push(saveLocalEdit(ticketKey, "title", session.localTitle, false));
      sessionPatch.localTitle = session.localTitle;
    }
    if (Object.keys(sessionPatch).length > 0) {
      saves.push(patchSession(ticketKey, sessionPatch));
    }
    if (session.targetTicketKey) {
      const targetSessionPatch: Record<string, string> = {};
      if (session.targetLocalDraft) {
        saves.push(saveLocalEdit(session.targetTicketKey, "description", session.targetLocalDraft, false));
        targetSessionPatch.targetLocalDraft = session.targetLocalDraft;
      }
      if (session.targetLocalTitle) {
        saves.push(saveLocalEdit(session.targetTicketKey, "title", session.targetLocalTitle, false));
        targetSessionPatch.targetLocalTitle = session.targetLocalTitle;
      }
      if (Object.keys(targetSessionPatch).length > 0) {
        saves.push(patchSession(ticketKey, targetSessionPatch));
      }
    }
    await Promise.all(saves);
  }, [ticketKey]);

  const pushToJira = useCallback(async (session: StoryWriterSessionRow | null) => {
    const hasOriginal = !!(session?.localDraft || session?.localTitle);
    const targetKey = session?.targetTicketKey ?? null;
    const hasTarget = !!(targetKey && (session?.targetLocalDraft || session?.targetLocalTitle));

    if (!hasOriginal && !hasTarget) return { success: false, conflict: false, contentChanged: false };

    await saveDraft(session);

    let result = { success: true, conflict: false, contentChanged: false };

    if (hasOriginal) {
      const data = await ticketsApi.pushToJira(ticketKey, {}) as { success: boolean; conflict: boolean; contentChanged: boolean };
      if (!data.success) result = data;
    }

    if (hasTarget && targetKey) {
      const targetData = await ticketsApi.pushToJira(targetKey, {}) as { success: boolean; conflict: boolean; contentChanged: boolean };
      if (!targetData.success && result.success) result = targetData;
    }

    if (result.success) {
      await refreshSession();
      // Invalidate SWR caches so the ticket detail page shows fresh data after navigation
      const keys = [ticketKey];
      if (targetKey) keys.push(targetKey);
      await Promise.all([
        ...keys.map((k) => globalMutate(`/api/tickets/${encodeURIComponent(k)}`)),
        globalMutate(
          (key) => typeof key === "string" && key.startsWith("/api/tickets?"),
          undefined,
          { revalidate: true },
        ),
      ]);
    }

    return result;
  }, [ticketKey, saveDraft, refreshSession]);

  return {
    updateLocalDraft,
    updateLocalTitle,
    updateTargetLocalDraft,
    updateTargetLocalTitle,
    acceptDraft,
    dismissDraft,
    saveDraft,
    pushToJira,
    clearTimers,
  };
}
