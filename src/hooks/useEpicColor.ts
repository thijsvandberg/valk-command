"use client";

import { useSyncExternalStore } from "react";
import { subscribeEpicColors, getEpicColorVersion } from "@/lib/epic-color-registry";
import { getEpicColor, type EpicColor } from "@/types/ticket";

// Reactive variant of getEpicColor: subscribes to the epic-color registry so the
// component re-renders when the PO assigns or clears a color. Accepts either an
// epic key or name (the registry resolves both). Used by the surfaces where a
// color change must reflect live; other call sites can use getEpicColor directly.
export function useEpicColor(keyOrName: string): EpicColor {
  useSyncExternalStore(subscribeEpicColors, getEpicColorVersion, getEpicColorVersion);
  return getEpicColor(keyOrName);
}

// Subscribes once and returns the resolver, for surfaces that color many epics
// in a render loop (where a per-item hook call would break the rules of hooks).
export function useEpicColorResolver(): (keyOrName: string) => EpicColor {
  useSyncExternalStore(subscribeEpicColors, getEpicColorVersion, getEpicColorVersion);
  return getEpicColor;
}
