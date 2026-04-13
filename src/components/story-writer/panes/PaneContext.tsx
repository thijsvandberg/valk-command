"use client";

import { createContext, useContext, useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";

export type PaneAppId =
  | "chat"
  | "editor"
  | "diff"
  | "history"
  | "draft-preview"
  | "related"
  | "story-preview"
  | "split-target";

export interface ToolbarSlot {
  label: string;
  contextLabel?: string;
  actions?: ReactNode;
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
};

interface PaneContextValue {
  paneCount: 1 | 2 | 3;
  paneVisible: PaneVisible;
  paneApps: PaneApps;
  paneWidths: PaneWidths;
  openApp: (appId: PaneAppId) => void;
  closeApp: (appId: PaneAppId) => void;
  moveApp: (appId: PaneAppId, paneIndex: 0 | 1 | 2) => void;
  setPaneCount: (n: 1 | 2 | 3) => void;
  showPane: (idx: 0 | 1 | 2) => void;
  hidePane: (idx: 0 | 1 | 2) => void;
  setPaneWidths: (w: PaneWidths) => void;

  registerToolbar: (appId: PaneAppId, slot: ToolbarSlot) => void;
  toolbars: Partial<Record<PaneAppId, ToolbarSlot>>;

  draftPreviewContent: DraftPreviewContent | null;
  openDraftPreview: (content: string, label: string, draftId?: string) => void;

  relatedSelectedKey: string | null;
  openRelated: (selectedKey?: string) => void;
  setRelatedSelectedKey: (key: string | null) => void;

  draggedApp: PaneAppId | null;
  setDraggedApp: (app: PaneAppId | null) => void;
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
  children: ReactNode;
}

export function PaneProvider({ ticketKey, children }: PaneProviderProps) {
  const stored = readStorage(ticketKey);

  const defaultVisible: PaneVisible = [true, true, false];

  const [paneVisible, setPaneVisibleState] = useState<PaneVisible>(
    stored?.paneVisible ?? defaultVisible,
  );
  const [paneApps, setPaneApps] = useState<PaneApps>(
    stored?.paneApps ?? ["chat", "editor", null],
  );
  const [paneWidths, setPaneWidthsState] = useState<PaneWidths>(() => {
    if (!stored) return [50, 50, 0];
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

  // Refs so event handlers always see the latest values without stale closure issues
  const paneVisibleRef = useRef(paneVisible);
  const paneWidthsRef = useRef(paneWidths);
  useEffect(() => { paneVisibleRef.current = paneVisible; }, [paneVisible]);
  useEffect(() => { paneWidthsRef.current = paneWidths; }, [paneWidths]);

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
    setPaneVisibleState(visible);
    setPaneWidthsState(widths);
  }

  function hidePane(idx: 0 | 1 | 2) {
    const { visible, widths } = computeHidePane(paneVisibleRef.current, paneWidthsRef.current, idx);
    setPaneVisibleState(visible);
    setPaneWidthsState(widths);
  }

  // Preset toggle (1/2/3 pane buttons): always sets the first N panes visible with equal widths
  function setPaneCount(n: 1 | 2 | 3) {
    const nextVisible: PaneVisible = [true, n >= 2, n >= 3];
    const nextWidths = buildEqualWidths(nextVisible);
    setPaneApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      for (let i = 0; i < 3; i++) {
        const idx = i as 0 | 1 | 2;
        if (!nextVisible[idx] && next[idx] !== null) next[idx] = null;
      }
      return next;
    });
    setPaneVisibleState(nextVisible);
    setPaneWidthsState(nextWidths);
  }

  function setPaneWidths(w: PaneWidths) {
    setPaneWidthsState(w);
  }

  function openApp(appId: PaneAppId) {
    const targetPane = DEFAULT_PANE[appId];
    const { visible, widths } = computeShowPane(
      paneVisibleRef.current,
      paneWidthsRef.current,
      targetPane,
    );
    setPaneVisibleState(visible);
    setPaneWidthsState(widths);
    setPaneApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[targetPane] = appId;
      return next;
    });
  }

  function closeApp(appId: PaneAppId) {
    const slotIdx = paneApps.findIndex((a) => a === appId);
    if (slotIdx === -1) return;
    const idx = slotIdx as 0 | 1 | 2;
    setPaneApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[idx] = null;
      return next;
    });
    const { visible, widths } = computeHidePane(paneVisibleRef.current, paneWidthsRef.current, idx);
    setPaneVisibleState(visible);
    setPaneWidthsState(widths);
  }

  function moveApp(appId: PaneAppId, paneIndex: 0 | 1 | 2) {
    const sourceIdx = paneApps.findIndex((a) => a === appId);

    // Show target pane, then hide source (it will be empty after the move)
    let { visible, widths } = computeShowPane(paneVisibleRef.current, paneWidthsRef.current, paneIndex);
    if (sourceIdx !== -1 && sourceIdx !== paneIndex) {
      ({ visible, widths } = computeHidePane(visible, widths, sourceIdx as 0 | 1 | 2));
    }
    setPaneVisibleState(visible);
    setPaneWidthsState(widths);

    setPaneApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      for (let i = 0; i < 3; i++) {
        if (next[i as 0 | 1 | 2] === appId) next[i as 0 | 1 | 2] = null;
      }
      next[paneIndex] = appId;
      return next;
    });
  }

  function registerToolbar(appId: PaneAppId, slot: ToolbarSlot) {
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
  }

  function openDraftPreview(content: string, label: string, draftId?: string) {
    setDraftPreviewContent({ content, label, draftId });
    const targetPane = DEFAULT_PANE["draft-preview"];
    const { visible, widths } = computeShowPane(
      paneVisibleRef.current,
      paneWidthsRef.current,
      targetPane,
    );
    setPaneVisibleState(visible);
    setPaneWidthsState(widths);
    setPaneApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[targetPane] = "draft-preview";
      return next;
    });
  }

  function openRelated(selectedKey?: string) {
    if (selectedKey !== undefined) setRelatedSelectedKey(selectedKey);
    const targetPane = DEFAULT_PANE["related"];
    const { visible, widths } = computeShowPane(
      paneVisibleRef.current,
      paneWidthsRef.current,
      targetPane,
    );
    setPaneVisibleState(visible);
    setPaneWidthsState(widths);
    setPaneApps((prev) => {
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
        setPaneCount,
        showPane,
        hidePane,
        setPaneWidths,
        registerToolbar,
        toolbars,
        draftPreviewContent,
        openDraftPreview,
        relatedSelectedKey,
        openRelated,
        setRelatedSelectedKey,
        draggedApp,
        setDraggedApp,
      }}
    >
      {children}
    </PaneContext.Provider>
  );
}
