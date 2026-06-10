"use client";

import { useSyncExternalStore } from "react";
import {
  getRecentlyViewedSnapshot,
  getRecentlyViewedServerSnapshot,
  subscribeRecentlyViewed,
  type RecentlyViewedEntry,
} from "@/lib/recently-viewed-store";

/**
 * Live view of the recently-viewed ticket list. Re-renders on same-tab writes
 * (custom event from recordTicketView) and cross-tab writes (storage event).
 */
export function useRecentlyViewed(): RecentlyViewedEntry[] {
  return useSyncExternalStore(
    subscribeRecentlyViewed,
    getRecentlyViewedSnapshot,
    getRecentlyViewedServerSnapshot,
  );
}
