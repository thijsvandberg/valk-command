import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WatchersRow } from "./WatchersRow";

const h = vi.hoisted(() => ({
  watchers: [] as { accountId: string; displayName: string; avatarUrl: string | null }[],
  candidates: [] as { accountId: string; displayName: string; avatarUrl: string | null; isFavorite?: boolean; teams?: string[] }[],
  mutate: vi.fn(),
  keys: [] as (string | null)[],
}));

vi.mock("swr", () => ({
  __esModule: true,
  default: (key: string | null) => {
    h.keys.push(key);
    if (!key) return { data: undefined, mutate: vi.fn() };
    if (key.startsWith("/api/jira/watchers?")) return { data: { watchers: h.watchers }, mutate: h.mutate };
    if (key === "/api/jira/watcher-candidates") return { data: { users: h.candidates }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  },
}));

const addWatcher = vi.fn().mockResolvedValue({ ok: true });
const removeWatcher = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(),
  jira: {
    watchersUrl: (k: string) => `/api/jira/watchers?issueKey=${k}`,
    watcherCandidatesUrl: () => "/api/jira/watcher-candidates",
    addWatcher: (...args: unknown[]) => addWatcher(...args),
    removeWatcher: (...args: unknown[]) => removeWatcher(...args),
  },
}));

function openPicker() {
  fireEvent.click(screen.getByLabelText("Add watcher"));
}

describe("WatchersRow", () => {
  beforeEach(() => {
    h.watchers = [];
    h.candidates = [
      { accountId: "acc-alice", displayName: "Alice", avatarUrl: null, isFavorite: false, teams: [] },
      { accountId: "acc-bob", displayName: "Bob", avatarUrl: null, isFavorite: false, teams: [] },
    ];
    h.mutate = vi.fn();
    h.keys = [];
    addWatcher.mockClear().mockResolvedValue({ ok: true });
    removeWatcher.mockClear().mockResolvedValue({ ok: true });
  });

  it("renders the empty state when there are no watchers", () => {
    render(<WatchersRow ticketKey="VPL-100" />);
    expect(screen.getByText("No watchers")).toBeInTheDocument();
  });

  it("fetches watchers with the issue URL for a real Jira key", () => {
    render(<WatchersRow ticketKey="VPL-100" />);
    expect(h.keys).toContain("/api/jira/watchers?issueKey=VPL-100");
  });

  it("does not fetch watchers for a draft ticket", () => {
    render(<WatchersRow ticketKey="DRAFT-748b82f8" />);
    // The watchers SWR key is null for a draft, so no watchers URL is ever built.
    expect(h.keys.some((k) => typeof k === "string" && k.includes("DRAFT-"))).toBe(false);
    expect(h.keys.some((k) => typeof k === "string" && k.includes("/api/jira/watchers"))).toBe(false);
    expect(screen.getByText("No watchers")).toBeInTheDocument();
  });

  it("renders an avatar stack with a +N overflow", () => {
    h.watchers = [
      { accountId: "1", displayName: "Alice", avatarUrl: null },
      { accountId: "2", displayName: "Bob", avatarUrl: null },
      { accountId: "3", displayName: "Carol", avatarUrl: null },
      { accountId: "4", displayName: "Dave", avatarUrl: null },
      { accountId: "5", displayName: "Erin", avatarUrl: null },
    ];
    render(<WatchersRow ticketKey="VPL-100" />);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByLabelText("5 watchers")).toBeInTheDocument();
  });

  it("adds a watcher through the Jira API", async () => {
    render(<WatchersRow ticketKey="VPL-100" />);
    openPicker();
    fireEvent.click(screen.getByText("Bob"));
    await waitFor(() => {
      expect(addWatcher).toHaveBeenCalledWith({ issueKey: "VPL-100", accountId: "acc-bob" });
    });
  });

  it("rolls back and shows a toast when adding fails", async () => {
    addWatcher.mockRejectedValueOnce(new Error("Jira down"));
    render(<WatchersRow ticketKey="VPL-100" />);
    openPicker();
    fireEvent.click(screen.getByText("Bob"));
    expect(await screen.findByText("Couldn't add watcher")).toBeInTheDocument();
    // Rollback: optimistic insert reverted to the previous (empty) list.
    expect(h.mutate).toHaveBeenLastCalledWith({ watchers: [] }, false);
  });

  it("removes a watcher through the Jira API", async () => {
    h.watchers = [{ accountId: "acc-alice", displayName: "Alice", avatarUrl: null }];
    render(<WatchersRow ticketKey="VPL-100" />);
    openPicker();
    fireEvent.click(screen.getByText("Alice"));
    await waitFor(() => {
      expect(removeWatcher).toHaveBeenCalledWith({ issueKey: "VPL-100", accountId: "acc-alice" });
    });
  });

  it("rolls back and shows a toast when removing fails", async () => {
    removeWatcher.mockRejectedValueOnce(new Error("Jira down"));
    h.watchers = [{ accountId: "acc-alice", displayName: "Alice", avatarUrl: null }];
    render(<WatchersRow ticketKey="VPL-100" />);
    openPicker();
    fireEvent.click(screen.getByText("Alice"));
    expect(await screen.findByText("Couldn't remove watcher")).toBeInTheDocument();
  });
});
