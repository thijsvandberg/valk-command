import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { SWRConfig } from "swr";

const apiFetch = vi.fn();
const swrFetcher = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  swrFetcher: (...args: unknown[]) => swrFetcher(...args),
}));

vi.mock("@/lib/event-bus", () => ({
  subscribeEvents: () => () => {},
}));

import { useStatusChanges } from "./useStatusChanges";
import type { StatusChangeItem } from "@/lib/status-changes-query";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children);
}

function item(overrides: Partial<StatusChangeItem> = {}): StatusChangeItem {
  return {
    id: "sc-1",
    ticketKey: "VPL-1",
    fromStatus: "TO DO",
    toStatus: "IN PROGRESS",
    changedAt: "2026-06-27T10:00:00.000Z",
    changedBy: "Dan",
    changedByAccountId: null,
    changedByAvatar: null,
    assignee: null,
    openSubtaskCount: 0,
    totalSubtaskCount: 0,
    newCommentCount: 0,
    lastCommentAt: null,
    storyEditedAt: null,
    sprintAdded: null,
    deployAdded: null,
    ...overrides,
  };
}

const SPRINT_ADD = { id: "scope-1", changedBy: "Frank", changedByAccountId: null, changedByAvatar: null, changedAt: "x" };
const DEPLOY_ADD = { id: "deploy:VPL-1:run-5", environment: "UAT3", completedAt: "2026-06-27T09:00:00.000Z", state: "SUCCESSFUL" };

describe("useStatusChanges.markSeen (BRDG-439/446)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({});
    swrFetcher.mockResolvedValue({ rows: [] });
  });

  it("marks BOTH the status-change id and the sprint-add id seen for a combined line", async () => {
    const { result } = renderHook(() => useStatusChanges(["VPL-1"]), { wrapper });
    await act(async () => {
      await result.current.markSeen(item({ id: "sc-1", sprintAdded: SPRINT_ADD }));
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/status-changes/seen", { method: "POST", body: { ids: ["sc-1", "scope-1"] } });
  });

  it("marks just the sprint-add id for a sprint-only line (null status id)", async () => {
    const { result } = renderHook(() => useStatusChanges(["VPL-1"]), { wrapper });
    await act(async () => {
      await result.current.markSeen(item({ id: null, toStatus: null, sprintAdded: { ...SPRINT_ADD, id: "scope-9" } }));
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/status-changes/seen", { method: "POST", body: { ids: ["scope-9"] } });
  });

  it("marks just the status-change id for a status-only line", async () => {
    const { result } = renderHook(() => useStatusChanges(["VPL-1"]), { wrapper });
    await act(async () => {
      await result.current.markSeen(item({ id: "sc-7", sprintAdded: null }));
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/status-changes/seen", { method: "POST", body: { ids: ["sc-7"] } });
  });

  it("marks just the deploy seen-key for a deploy-only line (BRDG-446)", async () => {
    const { result } = renderHook(() => useStatusChanges(["VPL-1"]), { wrapper });
    await act(async () => {
      await result.current.markSeen(item({ id: null, toStatus: null, sprintAdded: null, deployAdded: DEPLOY_ADD }));
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/status-changes/seen", { method: "POST", body: { ids: ["deploy:VPL-1:run-5"] } });
  });

  it("marks the status-change id AND the deploy seen-key for a combined status+deploy line (BRDG-446)", async () => {
    const { result } = renderHook(() => useStatusChanges(["VPL-1"]), { wrapper });
    await act(async () => {
      await result.current.markSeen(item({ id: "sc-3", deployAdded: DEPLOY_ADD }));
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/status-changes/seen", { method: "POST", body: { ids: ["sc-3", "deploy:VPL-1:run-5"] } });
  });
});
