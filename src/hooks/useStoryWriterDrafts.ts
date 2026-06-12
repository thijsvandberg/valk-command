"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { mutate as globalMutate } from "swr";
import type { StoryWriterSessionRow, StoryWriterDraftRow } from "@/db/schema";
import { storyWriter as storyWriterApi, tickets as ticketsApi, apiFetch } from "@/lib/api-client";
import { useLocalEditSaver, type LocalEditField } from "@/lib/local-edit-saver";

interface DraftOptions {
  apiBase: string;
  ticketKey: string;
  sessionRef: React.RefObject<StoryWriterSessionRow | null>;
  unmountedRef: React.RefObject<boolean>;
  setSession: (v: StoryWriterSessionRow | null | ((prev: StoryWriterSessionRow | null) => StoryWriterSessionRow | null)) => void;
  setAllDrafts: React.Dispatch<React.SetStateAction<StoryWriterDraftRow[]>>;
  refreshSession: () => Promise<void>;
}

export type DraftSaveState = "idle" | "saving" | "saved";

function patchSession(ticketKey: string, data: Record<string, unknown>) {
  return storyWriterApi.patchSession(ticketKey, data);
}

export function useStoryWriterDrafts(options: DraftOptions) {
  const { ticketKey, sessionRef, unmountedRef, setSession, setAllDrafts, refreshSession } = options;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetTitleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autosave bookkeeping: "saving" while edits are pending/in flight, "saved"
  // once everything landed. The token/conflict mechanics live in the shared
  // saver (BRDG-340) so the detail editors behave identically.
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("idle");
  const saver = useLocalEditSaver({ unmountedRef });
  // `${ticketKey}:${field}` -> value still awaiting a save (debounce pending).
  const pendingRef = useRef<Record<string, string>>({});

  const { isPaused, isConflictPaused, setExternalPause: setAutosavePaused } = saver;

  /** Saver write + pending bookkeeping for this hook's debounce layer. */
  const persistLocalEdit = useCallback(async (
    key: string,
    field: string,
    value: string,
    isDraft = true,
    opts?: { blind?: boolean },
  ) => {
    const row = await saver.persistLocalEdit(key, field as LocalEditField, value, { isDraft, blind: opts?.blind });
    const mapKey = `${key}:${field}`;
    if (pendingRef.current[mapKey] === value) delete pendingRef.current[mapKey];
    return row;
  }, [saver]);

  const markSavedIfQuiet = useCallback(() => {
    if (unmountedRef.current || isConflictPaused()) return;
    if (Object.keys(pendingRef.current).length === 0) setDraftSaveState("saved");
  }, [unmountedRef, isConflictPaused]);

  const clearTimers = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    if (targetSaveTimerRef.current) clearTimeout(targetSaveTimerRef.current);
    if (targetTitleSaveTimerRef.current) clearTimeout(targetTitleSaveTimerRef.current);
  }, []);

  // Self-cleanup on unmount so callers don't have to call clearTimers() manually.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
      if (targetSaveTimerRef.current) clearTimeout(targetSaveTimerRef.current);
      if (targetTitleSaveTimerRef.current) clearTimeout(targetTitleSaveTimerRef.current);
    };
  }, []);

  const updateLocalDraft = useCallback((content: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (!content && prev.localDraft) return prev;
      if (content === prev.localDraft) return prev;
      return { ...prev, localDraft: content };
    });

    if (!content) return;
    pendingRef.current[`${ticketKey}:description`] = content;
    setDraftSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (isPaused()) return;
      try {
        await patchSession(ticketKey, { localDraft: content });
        await persistLocalEdit(ticketKey, "description", content);
        markSavedIfQuiet();
      } catch { /* conflict surfaces via draftConflict; other errors retry on next edit */ }
    }, 500);
  }, [ticketKey, setSession, isPaused, persistLocalEdit, markSavedIfQuiet]);

  const updateTargetLocalDraft = useCallback((content: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (!content && prev.targetLocalDraft) return prev;
      if (content === prev.targetLocalDraft) return prev;
      return { ...prev, targetLocalDraft: content };
    });

    if (!content) return;
    setDraftSaveState("saving");
    if (targetSaveTimerRef.current) clearTimeout(targetSaveTimerRef.current);
    targetSaveTimerRef.current = setTimeout(async () => {
      if (isPaused()) return;
      try {
        await patchSession(ticketKey, { targetLocalDraft: content });
        markSavedIfQuiet();
      } catch { /* ignore */ }
    }, 500);
  }, [ticketKey, setSession, isPaused, markSavedIfQuiet]);

  const updateLocalTitle = useCallback((title: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (title === prev.localTitle) return prev;
      return { ...prev, localTitle: title };
    });

    pendingRef.current[`${ticketKey}:title`] = title;
    setDraftSaveState("saving");
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(async () => {
      if (isPaused()) return;
      try {
        await patchSession(ticketKey, { localTitle: title });
        await persistLocalEdit(ticketKey, "title", title);
        markSavedIfQuiet();
      } catch { /* conflict surfaces via draftConflict */ }
    }, 500);
  }, [ticketKey, setSession, isPaused, persistLocalEdit, markSavedIfQuiet]);

  const updateTargetLocalTitle = useCallback((title: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (title === prev.targetLocalTitle) return prev;
      return { ...prev, targetLocalTitle: title };
    });

    setDraftSaveState("saving");
    if (targetTitleSaveTimerRef.current) clearTimeout(targetTitleSaveTimerRef.current);
    targetTitleSaveTimerRef.current = setTimeout(async () => {
      if (isPaused()) return;
      try {
        const targetKey = sessionRef.current?.targetTicketKey ?? null;
        if (!targetKey) return;
        pendingRef.current[`${targetKey}:title`] = title;
        await patchSession(ticketKey, { targetLocalTitle: title });
        await persistLocalEdit(targetKey, "title", title);
        markSavedIfQuiet();
      } catch { /* conflict surfaces via draftConflict */ }
    }, 500);
  }, [ticketKey, sessionRef, setSession, isPaused, persistLocalEdit, markSavedIfQuiet]);

  const acceptDraft = useCallback(async (draftId: string) => {
    try {
      const data = await patchSession(ticketKey, { acceptDraftId: draftId }) as { session: StoryWriterSessionRow };
      const updated = data.session;
      if (!unmountedRef.current) setSession(updated);
      if (updated?.localDraft) {
        await persistLocalEdit(ticketKey, "description", updated.localDraft);
      }
    } catch { /* ignore */ }
  }, [ticketKey, setSession, unmountedRef, persistLocalEdit]);

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
      saves.push(persistLocalEdit(ticketKey, "description", session.localDraft, false));
      sessionPatch.localDraft = session.localDraft;
    }
    if (session.localTitle) {
      saves.push(persistLocalEdit(ticketKey, "title", session.localTitle, false));
      sessionPatch.localTitle = session.localTitle;
    }
    if (Object.keys(sessionPatch).length > 0) {
      saves.push(patchSession(ticketKey, sessionPatch));
    }
    if (session.targetTicketKey) {
      const targetSessionPatch: Record<string, string> = {};
      if (session.targetLocalDraft) {
        saves.push(persistLocalEdit(session.targetTicketKey, "description", session.targetLocalDraft, false));
        targetSessionPatch.targetLocalDraft = session.targetLocalDraft;
      }
      if (session.targetLocalTitle) {
        saves.push(persistLocalEdit(session.targetTicketKey, "title", session.targetLocalTitle, false));
        targetSessionPatch.targetLocalTitle = session.targetLocalTitle;
      }
      if (Object.keys(targetSessionPatch).length > 0) {
        saves.push(patchSession(ticketKey, targetSessionPatch));
      }
    }
    await Promise.all(saves);
    markSavedIfQuiet();
  }, [ticketKey, persistLocalEdit, markSavedIfQuiet]);

  const pushToJira = useCallback(async (session: StoryWriterSessionRow | null) => {
    const hasOriginal = !!(session?.localDraft || session?.localTitle);
    const targetKey = session?.targetTicketKey ?? null;
    const hasTarget = !!(targetKey && (session?.targetLocalDraft || session?.targetLocalTitle));

    if (!hasOriginal && !hasTarget) return { success: false, conflict: false, contentChanged: false };

    // The push flow flushes via saveDraft below; a debounce firing mid-push
    // would race it, so autosave pauses for the duration.
    setAutosavePaused(true);
    try {
      await saveDraft(session);
    } finally {
      setAutosavePaused(false);
    }

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
  }, [ticketKey, saveDraft, refreshSession, setAutosavePaused]);

  // Flush pending edits when the tab loses focus; fire-and-forget beacon on
  // unload (the beacon cannot carry the 409 handshake, so it saves blind —
  // the next interactive save reconciles).
  useEffect(() => {
    const flushNow = () => {
      if (isConflictPaused()) return;
      const entries = Object.entries(pendingRef.current);
      if (entries.length === 0) return;
      clearTimers();
      void Promise.all(
        entries.map(([mapKey, value]) => {
          const sep = mapKey.lastIndexOf(":");
          return persistLocalEdit(mapKey.slice(0, sep), mapKey.slice(sep + 1), value).catch(() => {});
        }),
      ).then(markSavedIfQuiet);
    };
    const beacon = () => {
      for (const [mapKey, value] of Object.entries(pendingRef.current)) {
        const sep = mapKey.lastIndexOf(":");
        const key = mapKey.slice(0, sep);
        const field = mapKey.slice(sep + 1);
        navigator.sendBeacon(
          `/api/tickets/${encodeURIComponent(key)}/local-edits`,
          new Blob([JSON.stringify({ field, localValue: value, isDraft: true })], { type: "application/json" }),
        );
      }
    };
    window.addEventListener("blur", flushNow);
    window.addEventListener("beforeunload", beacon);
    return () => {
      window.removeEventListener("blur", flushNow);
      window.removeEventListener("beforeunload", beacon);
    };
  }, [clearTimers, persistLocalEdit, markSavedIfQuiet, isConflictPaused]);

  const resolveDraftConflict = useCallback(async (action: "reload" | "overwrite") => {
    if (action === "reload") {
      // Drop our pending work and adopt the other tab's version + tokens.
      pendingRef.current = {};
      clearTimers();
      const keys = [ticketKey, sessionRef.current?.targetTicketKey].filter(Boolean) as string[];
      await Promise.all(keys.map(async (k) => {
        try {
          const rows = await apiFetch(`/api/tickets/${encodeURIComponent(k)}/local-edits`) as Array<{ field: string; modifiedAt: string }>;
          rows.forEach((r) => { saver.setToken(k, r.field, r.modifiedAt); });
        } catch { /* tokens reseed on the next successful save */ }
      }));
      await refreshSession();
    } else {
      // Force our version through and adopt the resulting tokens.
      const s = sessionRef.current;
      const writes: Promise<unknown>[] = [];
      if (s?.localDraft) writes.push(persistLocalEdit(ticketKey, "description", s.localDraft, true, { blind: true }));
      if (s?.localTitle) writes.push(persistLocalEdit(ticketKey, "title", s.localTitle, true, { blind: true }));
      if (s?.targetTicketKey && s.targetLocalTitle) {
        writes.push(persistLocalEdit(s.targetTicketKey, "title", s.targetLocalTitle, true, { blind: true }));
      }
      await Promise.all(writes);
      pendingRef.current = {};
    }
    saver.clearConflict();
    if (!unmountedRef.current) setDraftSaveState("saved");
  }, [ticketKey, sessionRef, unmountedRef, clearTimers, persistLocalEdit, refreshSession, saver]);

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
    draftSaveState,
    draftConflict: saver.conflict,
    resolveDraftConflict,
    setAutosavePaused,
  };
}
