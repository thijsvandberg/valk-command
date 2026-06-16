import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { NewStoryRow } from "@/lib/new-stories-types";

// A stateful mock of the account-setting hook keyed by URL, so the test can assert
// which settings keys the inbox writes to (and that the board key is never used).
const stores = new Map<string, unknown>();
const writes: string[] = [];

vi.mock("@/hooks/useMigratedAccountSetting", () => {
  // Local useState so a write re-renders the hook under test, while the shared
  // `stores`/`writes` records let the test inspect which keys were used.
  const { useState } = require("react");
  return {
    useMigratedAccountSetting: <T,>(url: string, _localKey: string, defaultValue: T) => {
      const [value, setLocal] = useState<T>(() => (stores.has(url) ? (stores.get(url) as T) : defaultValue));
      const setValue = (next: T | ((prev: T) => T)) => {
        setLocal((prev: T) => {
          const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
          stores.set(url, resolved);
          writes.push(url);
          return resolved;
        });
      };
      return { value, setValue, isLoading: false };
    },
  };
});

import { useInboxFilters } from "./useInboxFilters";

function row(partial: Partial<NewStoryRow> & { key: string }): NewStoryRow {
  return {
    title: partial.title ?? partial.key,
    type: partial.type ?? "story",
    jiraStatus: partial.jiraStatus ?? "TO DO",
    epic: partial.epic ?? null,
    epicKey: partial.epicKey ?? null,
    storyPoints: partial.storyPoints ?? null,
    assignee: partial.assignee ?? null,
    reporter: partial.reporter ?? null,
    sprintName: partial.sprintName ?? null,
    jiraCreatedAt: partial.jiraCreatedAt ?? "2026-06-16T10:00:00Z",
    key: partial.key,
  };
}

const ROWS: NewStoryRow[] = [
  row({ key: "VPL-1", jiraStatus: "TO DO", jiraCreatedAt: "2026-06-16T10:00:00Z" }),
  row({ key: "VPL-2", jiraStatus: "IN PROGRESS", jiraCreatedAt: "2026-06-15T10:00:00Z" }),
  row({ key: "VPL-3", jiraStatus: "TO DO", jiraCreatedAt: "2026-06-14T10:00:00Z" }),
];

describe("useInboxFilters (BRDG-357)", () => {
  beforeEach(() => {
    stores.clear();
    writes.length = 0;
  });

  it("returns rows newest-first by default", () => {
    const { result } = renderHook(() => useInboxFilters(ROWS));
    expect(result.current.filteredRows.map((r) => r.key)).toEqual(["VPL-1", "VPL-2", "VPL-3"]);
  });

  it("filters the list by selected status", () => {
    const { result } = renderHook(() => useInboxFilters(ROWS));
    act(() => result.current.filterProps.onStatusFilterChange(new Set(["IN PROGRESS"])));
    expect(result.current.filteredRows.map((r) => r.key)).toEqual(["VPL-2"]);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("derives status/epic/assignee options from the rows", () => {
    const rows = [
      row({ key: "A", jiraStatus: "DONE", epic: "Logging", assignee: { name: "Alice", initials: "A", color: "#000" } }),
      row({ key: "B", jiraStatus: "TO DO", epic: "Rooms" }),
    ];
    const { result } = renderHook(() => useInboxFilters(rows));
    expect(result.current.filterProps.statusOptions).toEqual(["DONE", "TO DO"]);
    expect(result.current.filterProps.epicOptions).toEqual(["Logging", "Rooms"]);
    expect(result.current.filterProps.assigneeOptions).toEqual(["Alice"]);
  });

  it("whitelists only the inbox filter categories and hides sprint-state options", () => {
    const { result } = renderHook(() => useInboxFilters(ROWS));
    expect(result.current.filterProps.categoryWhitelist).toEqual([
      "status", "epic", "assignee", "type", "team", "sprint",
    ]);
    expect(result.current.filterProps.hideSprintStateOptions).toBe(true);
  });

  it("persists display toggles under the inbox key, never the board key", () => {
    const { result } = renderHook(() => useInboxFilters(ROWS));
    act(() => result.current.filterProps.onColumnToggle("notes", true));
    expect(stores.get("/api/settings/inbox-row-fields")).toContain("notes");
    // The board's row-fields key is never written.
    expect(writes).not.toContain("/api/settings/sprint-board-row-fields");
    expect(writes).toContain("/api/settings/inbox-row-fields");
  });

  it("persists filters under the inbox key, never the board key", () => {
    const { result } = renderHook(() => useInboxFilters(ROWS));
    act(() => result.current.filterProps.onStatusFilterChange(new Set(["TO DO"])));
    expect(writes).toContain("/api/settings/inbox-filters");
    expect(writes).not.toContain("/api/settings/sprint-board-filters");
  });

  it("defaults the inbox display tags to a lean Epic/SP/Assignee subset", () => {
    const { result } = renderHook(() => useInboxFilters(ROWS));
    const tags = result.current.visibleTags;
    expect(tags.has("epic")).toBe(true);
    expect(tags.has("storyPoints")).toBe(true);
    expect(tags.has("assignee")).toBe(true);
    expect(tags.has("notes")).toBe(false);
    expect(tags.has("quality")).toBe(false);
  });
});
