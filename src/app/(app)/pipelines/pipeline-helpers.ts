"use client";

import type { PipelineRunPayload } from "@/app/api/pipelines/route";

// -- Types --

export type StatusFilterValue = "all" | "failed" | "successful" | "running" | "deployments";
export type DateRangeValue = "all" | "today" | "week" | "month";

// -- Filter Persistence --

export const STORAGE_KEY = "bridge:pipeline-filters";
export const PAGE_SIZE = 50;

export interface PersistedFilters {
  sprints?: string[];
  creators?: string[];
  status?: StatusFilterValue;
  dateRange?: DateRangeValue;
  repo?: string | null;
  unlinked?: boolean;
}

// -- Helpers --

export function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function stateLabel(state: PipelineRunPayload["state"]): string {
  switch (state) {
    case "SUCCESSFUL": return "Passed";
    case "FAILED": return "Failed";
    case "PAUSED": return "Paused";
    case "IN_PROGRESS": return "Running";
    case "STOPPED": return "Stopped";
  }
}

export function getDateCutoff(range: DateRangeValue): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (range === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday-based week
    now.setDate(now.getDate() - diff);
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (range === "month") {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now;
  }
  return null;
}
