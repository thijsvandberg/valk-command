"use client";

import { useSyncExternalStore, useCallback } from "react";
import {
  subscribeSectionCollapse,
  getSectionCollapseVersion,
  getServerSectionCollapseVersion,
  isSectionCollapsed,
  toggleSectionCollapsed,
} from "@/lib/section-collapse-store";

// Reactive accessor for the shared section-collapse store. Subscribing via the
// version snapshot re-renders every consumer in the document the moment any
// section is toggled, so collapsing a heading on one surface updates it on the
// others immediately.
export function useSectionCollapsed(): {
  isCollapsed: (key: string, fallback?: boolean) => boolean;
  toggle: (key: string, fallback?: boolean) => void;
} {
  useSyncExternalStore(
    subscribeSectionCollapse,
    getSectionCollapseVersion,
    getServerSectionCollapseVersion,
  );

  const isCollapsed = useCallback((key: string, fallback?: boolean) => isSectionCollapsed(key, fallback), []);
  const toggle = useCallback((key: string, fallback?: boolean) => toggleSectionCollapsed(key, fallback), []);

  return { isCollapsed, toggle };
}
