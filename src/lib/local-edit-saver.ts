"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

export interface PersistLocalEditOptions {
  /** Stored as the draft flag server-side; defaults to true (autosave layer). */
  isDraft?: boolean;
  /** Skip the concurrency token: force the write through (used by Overwrite). */
  blind?: boolean;
}

export type LocalEditField = "title" | "description";

/**
 * Shared optimistic-concurrency save choke point for ticket local edits
 * (BRDG-340, extracted from the Story Writer drafts hook of BRDG-339).
 *
 * Owns the `${ticketKey}:${field}` -> modifiedAt token map: every save sends
 * the token it last saw (unless blind) and adopts the one the server returns.
 * A 409 means another tab/surface saved the same field in between — the hook
 * flips `conflict`, pauses itself, and remembers the rejected value so
 * `overwrite()` can force it through. Callers own debouncing, pending
 * bookkeeping and the saving/saved indicator.
 */
export function useLocalEditSaver(opts?: { unmountedRef?: React.RefObject<boolean> }) {
  const fallbackUnmountedRef = useRef(false);
  const unmountedRef = opts?.unmountedRef ?? fallbackUnmountedRef;
  const [conflict, setConflict] = useState(false);
  const baseModifiedAtRef = useRef<Record<string, string>>({});
  const conflictPausedRef = useRef(false);
  const externallyPausedRef = useRef(false);
  // `${key}:${field}` -> the write the server rejected with 409.
  const lastRejectedRef = useRef<Record<string, { value: string; isDraft: boolean }>>({});

  const isConflictPaused = useCallback(() => conflictPausedRef.current, []);
  const isPaused = useCallback(
    () => conflictPausedRef.current || externallyPausedRef.current,
    [],
  );
  const setExternalPause = useCallback((paused: boolean) => {
    externallyPausedRef.current = paused;
  }, []);

  const setToken = useCallback((key: string, field: string, modifiedAt: string) => {
    baseModifiedAtRef.current[`${key}:${field}`] = modifiedAt;
  }, []);

  const clearTokens = useCallback(() => {
    baseModifiedAtRef.current = {};
  }, []);

  const clearConflict = useCallback(() => {
    conflictPausedRef.current = false;
    lastRejectedRef.current = {};
    if (!unmountedRef.current) setConflict(false);
  }, [unmountedRef]);

  const persistLocalEdit = useCallback(async (
    key: string,
    field: LocalEditField,
    value: string,
    options?: PersistLocalEditOptions,
  ) => {
    const isDraft = options?.isDraft ?? true;
    const mapKey = `${key}:${field}`;
    const base = options?.blind ? undefined : baseModifiedAtRef.current[mapKey];
    try {
      const row = await apiFetch(`/api/tickets/${encodeURIComponent(key)}/local-edits`, {
        method: "PUT",
        body: { field, localValue: value, isDraft, ...(base ? { baseModifiedAt: base } : {}) },
      }) as { modifiedAt?: string } | null;
      if (row?.modifiedAt) baseModifiedAtRef.current[mapKey] = row.modifiedAt;
      delete lastRejectedRef.current[mapKey];
      return row;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        conflictPausedRef.current = true;
        lastRejectedRef.current[mapKey] = { value, isDraft };
        if (!unmountedRef.current) setConflict(true);
      }
      throw err;
    }
  }, [unmountedRef]);

  /** Force the 409-rejected values through (blind) and clear the conflict. */
  const overwrite = useCallback(async () => {
    const entries = Object.entries(lastRejectedRef.current);
    await Promise.all(entries.map(([mapKey, { value, isDraft }]) => {
      const sep = mapKey.lastIndexOf(":");
      return persistLocalEdit(
        mapKey.slice(0, sep),
        mapKey.slice(sep + 1) as LocalEditField,
        value,
        { isDraft, blind: true },
      );
    }));
    clearConflict();
  }, [persistLocalEdit, clearConflict]);

  return {
    persistLocalEdit,
    overwrite,
    conflict,
    isPaused,
    isConflictPaused,
    setExternalPause,
    setToken,
    clearTokens,
    clearConflict,
  };
}

export type LocalEditSaver = ReturnType<typeof useLocalEditSaver>;
