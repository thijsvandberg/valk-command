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
  paneApps: PaneApps;
  paneWidths: PaneWidths;
  mountedApps: Set<PaneAppId>;

  openApp: (appId: PaneAppId) => void;
  closeApp: (appId: PaneAppId) => void;
  moveApp: (appId: PaneAppId, paneIndex: 0 | 1 | 2) => void;
  setPaneCount: (n: 1 | 2 | 3) => void;
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

function buildEqualWidths(count: 1 | 2 | 3): PaneWidths {
  if (count === 1) return [100, 0, 0];
  if (count === 2) return [50, 50, 0];
  return [33.33, 33.33, 33.34];
}

function readStorage(ticketKey: string): {
  paneCount: 1 | 2 | 3;
  paneApps: PaneApps;
  paneWidths: PaneWidths;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`sw:${ticketKey}:panes`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorage(
  ticketKey: string,
  state: { paneCount: 1 | 2 | 3; paneApps: PaneApps; paneWidths: PaneWidths },
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

  const [paneCount, setPaneCountState] = useState<1 | 2 | 3>(stored?.paneCount ?? 2);
  const [paneApps, setPaneApps] = useState<PaneApps>(
    stored?.paneApps ?? ["chat", "editor", null],
  );
  const [paneWidths, setPaneWidthsState] = useState<PaneWidths>(() => {
    if (!stored) return buildEqualWidths(2);
    // Validate stored widths: if any visible pane has 0 or missing width, reset to equal
    const { paneCount: sc, paneWidths: sw } = stored;
    for (let i = 0; i < sc; i++) {
      if ((sw[i] ?? 0) <= 0) return buildEqualWidths(sc);
    }
    return sw;
  });
  // Restore mounted apps from storage, or default to chat+editor
  const [mountedApps, setMountedApps] = useState<Set<PaneAppId>>(() => {
    if (stored) {
      return new Set(stored.paneApps.filter(Boolean) as PaneAppId[]);
    }
    return new Set(["chat", "editor"] as PaneAppId[]);
  });
  const [toolbars, setToolbars] = useState<Partial<Record<PaneAppId, ToolbarSlot>>>({});
  const [draftPreviewContent, setDraftPreviewContent] = useState<DraftPreviewContent | null>(null);
  const [relatedSelectedKey, setRelatedSelectedKey] = useState<string | null>(null);
  const [draggedApp, setDraggedApp] = useState<PaneAppId | null>(null);

  // Persist state to localStorage when it changes
  useEffect(() => {
    writeStorage(ticketKey, { paneCount, paneApps, paneWidths });
  }, [ticketKey, paneCount, paneApps, paneWidths]);

  // Global safety net: clear draggedApp whenever any drag operation ends
  useEffect(() => {
    const handler = () => setDraggedApp(null);
    document.addEventListener("dragend", handler);
    return () => document.removeEventListener("dragend", handler);
  }, []);

  function setPaneCount(n: 1 | 2 | 3) {
    setPaneCountState(n);
    setPaneWidthsState((prev) => {
      if (n === 1) return [100, 0, 0];
      if (n === 2) {
        // Preserve ratio only when both panes already had width
        if (prev[0] > 0 && prev[1] > 0) {
          const total = prev[0] + prev[1];
          const ratio = prev[0] / total;
          return [ratio * 100, (1 - ratio) * 100, 0];
        }
        return [50, 50, 0];
      }
      // 3 panes: preserve only when all three panes already had width
      if (prev[0] > 0 && prev[1] > 0 && prev[2] > 0) return prev;
      return buildEqualWidths(3);
    });
  }

  function setPaneWidths(w: PaneWidths) {
    setPaneWidthsState(w);
  }

  function openApp(appId: PaneAppId) {
    setMountedApps((prev) => new Set([...prev, appId]));
    // Clamp to the next available slot to avoid creating gaps (e.g. pane 1→3)
    const preferred = DEFAULT_PANE[appId];
    const targetPane = Math.min(preferred, paneCount) as 0 | 1 | 2;
    if (targetPane + 1 > paneCount) {
      setPaneCount((targetPane + 1) as 1 | 2 | 3);
    }
    setPaneApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[targetPane] = appId;
      return next;
    });
  }

  function closeApp(appId: PaneAppId) {
    // Compute new state from current paneApps (functions redefine on each render, so closure is fresh)
    const newApps: PaneApps = [...paneApps] as PaneApps;
    for (let i = 0; i < 3; i++) {
      if (newApps[i] === appId) newApps[i] = null;
    }
    setPaneApps(newApps);
    // Auto-collapse paneCount to remove trailing empty panes
    const highestOccupied = newApps.reduce((max, app, i) => (app !== null ? i : max), -1);
    const newCount = Math.max(1, highestOccupied + 1) as 1 | 2 | 3;
    if (newCount < paneCount) {
      setPaneCount(newCount);
    }
    // State is preserved — component stays mounted (mountedApps not changed)
  }

  function moveApp(appId: PaneAppId, paneIndex: 0 | 1 | 2) {
    setMountedApps((prev) => new Set([...prev, appId]));
    // Auto-expand pane count when dropping into a slot that isn't visible yet
    if (paneIndex + 1 > paneCount) {
      setPaneCount((paneIndex + 1) as 1 | 2 | 3);
    }
    setPaneApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      // Remove from current location
      for (let i = 0; i < 3; i++) {
        if (next[i] === appId) next[i] = null;
      }
      // Displace current occupant (it becomes inactive, not destroyed)
      next[paneIndex] = appId;
      return next;
    });
  }

  function registerToolbar(appId: PaneAppId, slot: ToolbarSlot) {
    setToolbars((prev) => {
      // Shallow-compare to avoid unnecessary re-renders
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
    setMountedApps((prev) => new Set([...prev, "draft-preview" as PaneAppId]));
    const targetPane = Math.min(DEFAULT_PANE["draft-preview"], paneCount) as 0 | 1 | 2;
    if (targetPane + 1 > paneCount) {
      setPaneCount((targetPane + 1) as 1 | 2 | 3);
    }
    setPaneApps((prev) => {
      const next: PaneApps = [...prev] as PaneApps;
      next[targetPane] = "draft-preview";
      return next;
    });
  }

  function openRelated(selectedKey?: string) {
    if (selectedKey !== undefined) setRelatedSelectedKey(selectedKey);
    setMountedApps((prev) => new Set([...prev, "related" as PaneAppId]));
    const targetPane = Math.min(DEFAULT_PANE["related"], paneCount) as 0 | 1 | 2;
    if (targetPane + 1 > paneCount) {
      setPaneCount((targetPane + 1) as 1 | 2 | 3);
    }
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
        paneApps,
        paneWidths,
        mountedApps,
        openApp,
        closeApp,
        moveApp,
        setPaneCount,
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
