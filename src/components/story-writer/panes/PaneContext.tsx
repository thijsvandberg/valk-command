"use client";

import { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

export type PaneAppId =
  | "chat"
  | "editor"
  | "diff"
  | "history"
  | "draft-preview"
  | "related"
  | "story-preview"
  | "split-target"
  | "meta";

export interface ToolbarSlot {
  label: string;
  contextLabel?: string;
  /** Rendered immediately after the label (left side) */
  actions?: ReactNode;
  /** Rendered immediately left of the close button (right side) */
  rightActions?: ReactNode;
}

export interface DraftPreviewContent {
  content: string;
  label: string;
  draftId?: string;
}

type PaneApps = [PaneAppId | null, PaneAppId | null, PaneAppId | null];
type PaneWidths = [number, number, number];
type PaneVisible = [boolean, boolean, boolean];

const DEFAULT_PANE: Record<PaneAppId, 0 | 1 | 2> = {
  chat: 0,
  editor: 1,
  diff: 2,
  history: 2,
  "draft-preview": 2,
  related: 2,
  "story-preview": 2,
  "split-target": 2,
  meta: 2,
};

interface PaneContextValue {
  paneCount: 1 | 2 | 3;
  paneVisible: PaneVisible;
  paneApps: PaneApps;
  paneWidths: PaneWidths;
  openApp: (appId: PaneAppId) => void;
  closeApp: (appId: PaneAppId) => void;
  moveApp: (appId: PaneAppId, paneIndex: 0 | 1 | 2) => void;
  showPane: (idx: 0 | 1 | 2) => void;
  hidePane: (idx: 0 | 1 | 2) => void;
  setPaneWidths: (w: PaneWidths) => void;

  registerToolbar: (appId: PaneAppId, slot: ToolbarSlot) => void;
  unregisterToolbar: (appId: PaneAppId) => void;
  toolbars: Partial<Record<PaneAppId, ToolbarSlot>>;

  draftPreviewContent: DraftPreviewContent | null;
  openDraftPreview: (content: string, label: string, draftId?: string) => void;
  focusDraftPreview: (content: string, label: string, draftId?: string) => void;

  relatedSelectedKey: string | null;
  openRelated: (selectedKey?: string) => void;
  setRelatedSelectedKey: (key: string | null) => void;

  draggedApp: PaneAppId | null;
  setDraggedApp: (app: PaneAppId | null) => void;

  pendingChatInput: string | null;
  prefillChat: (text: string) => void;
  consumePendingChatInput: () => string | null;

  pendingDiffDraftId: string | null;
  openDiffForDraft: (draftId: string) => void;
  consumePendingDiffDraftId: () => string | null;
}

const PaneContext = createContext<PaneContextValue | null>(null);

export function usePaneContext(): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) throw new Error("usePaneContext must be used inside PaneProvider");
  return ctx;
}

function buildEqualWidths(visible: PaneVisible): PaneWidths {
  const count = visible.filter(Boolean).length;
  if (count === 0) return [100, 0, 0];
  const share = 100 / count;
  return [visible[0] ? share : 0, visible[1] ? share : 0, visible[2] ? share : 0];
}

// Pure helpers — compute new visibility/width state without side effects so callers
// can chain multiple transitions in a single event handler.
function computeShowPane(
  prevVisible: PaneVisible,
  prevWidths: PaneWidths,
  idx: 0 | 1 | 2,
): { visible: PaneVisible; widths: PaneWidths } {
  if (prevVisible[idx]) return { visible: prevVisible, widths: prevWidths };
  const nextVisible: PaneVisible = [...prevVisible] as PaneVisible;
  nextVisible[idx] = true;
  const existingCount = prevVisible.filter(Boolean).length;
  const newCount = existingCount + 1;
  const newShare = 100 / newCount;
  const nextWidths: PaneWidths = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (i === idx) {
      nextWidths[i] = newShare;
    } else if (nextVisible[i]) {
      nextWidths[i] = (prevWidths[i] * existingCount) / newCount;
    }
  }
  return { visible: nextVisible, widths: nextWidths };
}

function computeHidePane(
  prevVisible: PaneVisible,
  prevWidths: PaneWidths,
  idx: 0 | 1 | 2,
): { visible: PaneVisible; widths: PaneWidths } {
  if (!prevVisible[idx]) return { visible: prevVisible, widths: prevWidths };
  const visibleCount = prevVisible.filter(Boolean).length;
  // Never hide the last visible pane
  if (visibleCount <= 1) return { visible: prevVisible, widths: prevWidths };

  const nextVisible: PaneVisible = [...prevVisible] as PaneVisible;
  nextVisible[idx] = false;

  const removedWidth = prevWidths[idx];
  const remainingTotal = 100 - removedWidth;
  const nextWidths: PaneWidths = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (i === idx) {
      nextWidths[i] = 0;
    } else if (nextVisible[i]) {
      nextWidths[i] =
        remainingTotal > 0
          ? (prevWidths[i] / remainingTotal) * 100
          : 100 / (visibleCount - 1);
    }
  }
  return { visible: nextVisible, widths: nextWidths };
}

function readStorage(ticketKey: string): {
  paneVisible: PaneVisible;
  paneApps: PaneApps;
  paneWidths: PaneWidths;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`sw:${ticketKey}:panes`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Migrate from old paneCount format
    if (typeof parsed.paneCount === "number" && !parsed.paneVisible) {
      const n = parsed.paneCount as number;
      parsed.paneVisible = [true, n >= 2, n >= 3];
    }
    if (!Array.isArray(parsed.paneVisible)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(
  ticketKey: string,
  state: { paneVisible: PaneVisible; paneApps: PaneApps; paneWidths: PaneWidths },
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`sw:${ticketKey}:panes`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface PaneProviderProps {
  ticketKey: string;
  initialEditorOpen?: boolean;
  children: ReactNode;
}

export function PaneProvider({ ticketKey, initialEditorOpen = true, children }: PaneProviderProps) {
  const stored = readStorage(ticketKey);

  const defaultApps: PaneApps = initialEditorOpen ? ["chat", "editor", null] : ["chat", null, null];
  const defaultVisible: PaneVisible = initialEditorOpen ? [true, true, false] : [true, false, false];

  const [paneVisible, setPaneVisibleState] = useState<PaneVisible>(
    stored?.paneVisible ?? defaultVisible,
  );
  const [paneApps, setPaneApps] = useState<PaneApps>(
    stored?.paneApps ?? defaultApps,
  );
  const [paneWidths, setPaneWidthsState] = useState<PaneWidths>(() => {
    if (!stored) return initialEditorOpen ? [50, 50, 0] : [100, 0, 0];
    const { paneVisible: sv, paneWidths: sw } = stored;
    for (let i = 0; i < 3; i++) {
      if (sv[i] && (sw[i] ?? 0) <= 0) return buildEqualWidths(sv);
    }
    return sw;
  });
  const [toolbars, setToolbars] = useState<Partial<Record<PaneAppId, ToolbarSlot>>>({});
  const [draftPreviewContent, setDraftPreviewContent] = useState<DraftPreviewContent | null>(null);
  const [relatedSelectedKey, setRelatedSelectedKey] = useState<string | null>(null);
  const [draggedApp, setDraggedApp] = useState<PaneAppId | null>(null);
  const [pendingChatInput, setPendingChatInput] = useState<string | null>(null);
  const [pendingDiffDraftId, setPendingDiffDraftId] = useState<string | null>(null);

  // Refs so chained calls within the same event handler see each other's changes
  const paneVisibleRef = useRef(paneVisible);
  const paneWidthsRef = useRef(paneWidths);
  const paneAppsRef = useRef(paneApps);

  function setVisible(v: PaneVisible) {
    paneVisibleRef.current = v;
    setPaneVisibleState(v);
  }
  function setWidths(w: PaneWidths) {
    paneWidthsRef.current = w;
    setPaneWidthsState(w);
  }
  function setApps(updater: PaneApps | ((prev: PaneApps) => PaneApps)) {
    setPaneApps((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      paneAppsRef.current = next;
      return next;
    });
  }

  // paneCount is derived — callers that need a number use this
  const paneCount = paneVisible.filter(Boolean).length as 1 | 2 | 3;

  useEffect(() => {
    writeStorage(ticketKey, { paneVisible, paneApps, paneWidths });
  }, [ticketKey, paneVisible, paneApps, paneWidths]);

  useEffect(() => {
    const handler = () => setDraggedApp(null);
    document.addEventListener("dragend", handler);
    return () => document.removeEventListener("dragend", handler);
  }, []);

  function showPane(idx: 0 | 1 | 2) {
    const { visible, widths } = computeShowPane(paneVisibleRef.current, paneWidthsRef.current, idx);
    setVisible(visible);
    setWidths(widths);
  }

  function hidePane(idx: 0 | 1 | 2) {
    const { visible, widths } = computeHidePane(paneVisibleRef.current, paneWidthsRef.current, idx);
    setVisible(visible);
    setWidths(widths);
  }

  function setPaneWidths(w: PaneWidths) {
    setWidths(w);
  }

  const openApp = useCallback((appId: PaneAppId) => {
    const targetPane = DEFAULT_PANE[appId];
    const { visible, widths } = computeShowPane(
      paneVisibleRef.current,
      paneWidthsRef.current,
      targetPane,
    );
    setVisible(visible);
    setWidths(widths);
    setApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[targetPane] = appId;
      return next;
    });
  }, []);

  const closeApp = useCallback((appId: PaneAppId) => {
    const slotIdx = paneAppsRef.current.findIndex((a) => a === appId);
    if (slotIdx === -1) return;
    const idx = slotIdx as 0 | 1 | 2;
    setApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[idx] = null;
      return next;
    });
    const { visible, widths } = computeHidePane(paneVisibleRef.current, paneWidthsRef.current, idx);
    setVisible(visible);
    setWidths(widths);
  }, []);

  function moveApp(appId: PaneAppId, paneIndex: 0 | 1 | 2) {
    const sourceIdx = paneAppsRef.current.findIndex((a) => a === appId);

    // Show target pane, then hide source (it will be empty after the move)
    let { visible, widths } = computeShowPane(paneVisibleRef.current, paneWidthsRef.current, paneIndex);
    if (sourceIdx !== -1 && sourceIdx !== paneIndex) {
      ({ visible, widths } = computeHidePane(visible, widths, sourceIdx as 0 | 1 | 2));
    }
    setVisible(visible);
    setWidths(widths);

    setApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      for (let i = 0; i < 3; i++) {
        if (next[i as 0 | 1 | 2] === appId) next[i as 0 | 1 | 2] = null;
      }
      next[paneIndex] = appId;
      return next;
    });
  }

  // Stable references so app components can list these as effect deps without
  // triggering a re-registration on every PaneProvider render.
  const registerToolbar = useCallback((appId: PaneAppId, slot: ToolbarSlot) => {
    setToolbars((prev) => {
      const existing = prev[appId];
      if (
        existing &&
        existing.label === slot.label &&
        existing.contextLabel === slot.contextLabel &&
        existing.actions === slot.actions
      ) {
        return prev;
      }
      return { ...prev, [appId]: slot };
    });
  }, []);

  const unregisterToolbar = useCallback((appId: PaneAppId) => {
    setToolbars((prev) => {
      if (!(appId in prev)) return prev;
      const next = { ...prev };
      delete next[appId];
      return next;
    });
  }, []);

  function openDraftPreview(content: string, label: string, draftId?: string) {
    setDraftPreviewContent({ content, label, draftId });
    const targetPane = DEFAULT_PANE["draft-preview"];
    const { visible, widths } = computeShowPane(
      paneVisibleRef.current,
      paneWidthsRef.current,
      targetPane,
    );
    setVisible(visible);
    setWidths(widths);
    setApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[targetPane] = "draft-preview";
      return next;
    });
  }

  function focusDraftPreview(content: string, label: string, draftId?: string) {
    setDraftPreviewContent({ content, label, draftId });
    // Close all panes and open draft-preview in pane 0 so it occupies the full width
    const nextVisible: PaneVisible = [true, false, false];
    const nextWidths: PaneWidths = [100, 0, 0];
    setVisible(nextVisible);
    setWidths(nextWidths);
    setApps((_prev) => ["draft-preview", null, null]);
  }

  function prefillChat(text: string) {
    setPendingChatInput(text);
    openApp("chat");
  }

  function consumePendingChatInput(): string | null {
    const v = pendingChatInput;
    if (v !== null) setPendingChatInput(null);
    return v;
  }

  function openDiffForDraft(draftId: string) {
    setPendingDiffDraftId(draftId);
    openApp("diff");
  }

  function consumePendingDiffDraftId(): string | null {
    const v = pendingDiffDraftId;
    if (v !== null) setPendingDiffDraftId(null);
    return v;
  }

  function openRelated(selectedKey?: string) {
    if (selectedKey !== undefined) setRelatedSelectedKey(selectedKey);
    const targetPane = DEFAULT_PANE["related"];
    const { visible, widths } = computeShowPane(
      paneVisibleRef.current,
      paneWidthsRef.current,
      targetPane,
    );
    setVisible(visible);
    setWidths(widths);
    setApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[targetPane] = "related";
      return next;
    });
  }

  return (
    <PaneContext.Provider
      value={{
        paneCount,
        paneVisible,
        paneApps,
        paneWidths,
        openApp,
        closeApp,
        moveApp,
        showPane,
        hidePane,
        setPaneWidths,
        registerToolbar,
        unregisterToolbar,
        toolbars,
        draftPreviewContent,
        openDraftPreview,
        focusDraftPreview,
        relatedSelectedKey,
        openRelated,
        setRelatedSelectedKey,
        draggedApp,
        setDraggedApp,
        pendingChatInput,
        prefillChat,
        consumePendingChatInput,
        pendingDiffDraftId,
        openDiffForDraft,
        consumePendingDiffDraftId,
      }}
    >
      {children}
    </PaneContext.Provider>
  );
}
