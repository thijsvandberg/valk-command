"use client";

import { useCallback, useRef } from "react";
import { mutate as globalMutate } from "swr";
import type { StoryWriterSessionRow, StoryWriterDraftRow } from "@/db/schema";

interface DraftOptions {
  apiBase: string;
  ticketKey: string;
  sessionRef: React.RefObject<StoryWriterSessionRow | null>;
  unmountedRef: React.RefObject<boolean>;
  setSession: (v: StoryWriterSessionRow | null | ((prev: StoryWriterSessionRow | null) => StoryWriterSessionRow | null)) => void;
  setAllDrafts: React.Dispatch<React.SetStateAction<StoryWriterDraftRow[]>>;
  refreshSession: () => Promise<void>;
}

function patchSession(apiBase: string, data: Record<string, unknown>) {
  return fetch(apiBase, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

function saveLocalEdit(ticketKey: string, field: string, value: string, isDraft = true) {
  return fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/local-edits`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, localValue: value, isDraft }),
  });
}

export function useStoryWriterDrafts(options: DraftOptions) {
  const { apiBase, ticketKey, sessionRef, unmountedRef, setSession, setAllDrafts, refreshSession } = options;

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
        await patchSession(apiBase, { localDraft: content });
        await saveLocalEdit(ticketKey, "description", content);
      } catch { /* ignore */ }
    }, 500);
  }, [apiBase, ticketKey, setSession]);

  const updateTargetLocalDraft = useCallback((content: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (content === prev.targetLocalDraft) return prev;
      return { ...prev, targetLocalDraft: content };
    });

    if (targetSaveTimerRef.current) clearTimeout(targetSaveTimerRef.current);
    targetSaveTimerRef.current = setTimeout(async () => {
      try {
        await patchSession(apiBase, { targetLocalDraft: content });
      } catch { /* ignore */ }
    }, 500);
  }, [apiBase, setSession]);

  const updateLocalTitle = useCallback((title: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (title === prev.localTitle) return prev;
      return { ...prev, localTitle: title };
    });

    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(async () => {
      try {
        await patchSession(apiBase, { localTitle: title });
        await saveLocalEdit(ticketKey, "title", title);
      } catch { /* ignore */ }
    }, 500);
  }, [apiBase, ticketKey, setSession]);

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
        await patchSession(apiBase, { targetLocalTitle: title });
        await saveLocalEdit(targetKey, "title", title);
      } catch { /* ignore */ }
    }, 500);
  }, [apiBase, sessionRef, setSession]);

  const acceptDraft = useCallback(async (draftId: string) => {
    try {
      const res = await patchSession(apiBase, { acceptDraftId: draftId });
      if (res.ok) {
        const { session: updated } = await res.json();
        if (!unmountedRef.current) setSession(updated);
        if (updated?.localDraft) {
          await saveLocalEdit(ticketKey, "description", updated.localDraft);
        }
      }
    } catch { /* ignore */ }
  }, [apiBase, ticketKey, setSession, unmountedRef]);

  const dismissDraft = useCallback(async (draftId: string) => {
    try {
      await fetch(`${apiBase}/apply-draft?draftId=${draftId}`, { method: "DELETE" });
      if (!unmountedRef.current) {
        setAllDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
    } catch { /* ignore */ }
  }, [apiBase, unmountedRef, setAllDrafts]);

  const saveDraft = useCallback(async (session: StoryWriterSessionRow | null) => {
    if (!session) return;
    const saves: Promise<unknown>[] = [];
    if (session.localDraft) {
      saves.push(saveLocalEdit(ticketKey, "description", session.localDraft, false));
    }
    if (session.localTitle) {
      saves.push(saveLocalEdit(ticketKey, "title", session.localTitle, false));
    }
    if (session.targetTicketKey) {
      if (session.targetLocalDraft) {
        saves.push(saveLocalEdit(session.targetTicketKey, "description", session.targetLocalDraft, false));
      }
      if (session.targetLocalTitle) {
        saves.push(saveLocalEdit(session.targetTicketKey, "title", session.targetLocalTitle, false));
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
      const pushRes = await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/push-to-jira`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await pushRes.json();
      if (!data.success) result = data;
    }

    if (hasTarget && targetKey) {
      const targetPushRes = await fetch(`/api/tickets/${encodeURIComponent(targetKey)}/push-to-jira`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const targetData = await targetPushRes.json();
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
