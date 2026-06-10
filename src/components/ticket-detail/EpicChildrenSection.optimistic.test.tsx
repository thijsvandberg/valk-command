import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicChildrenSection } from "./EpicChildrenSection";
import type { EpicChild, JiraStatus, TicketReadiness } from "@/types/ticket";

// BRDG-334: child status/readiness changes must patch the epic's cached detail
// optimistically. The row is stubbed to expose the change callbacks as buttons;
// the assertions cover the handler flow, not the pill UI.
vi.mock("./ChildIssueRow", () => ({
  ChildIssueRow: ({ item, onJiraStatusChange, onReadinessChange }: {
    item: { key: string; title: string };
    onJiraStatusChange?: (s: JiraStatus) => void;
    onReadinessChange?: (r: TicketReadiness | null) => void;
  }) => (
    <div data-testid={`child-row-${item.key}`}>
      <span>{item.title}</span>
      <button aria-label={`set-status-${item.key}`} onClick={() => onJiraStatusChange?.("IN PROGRESS")} />
      <button aria-label={`set-readiness-${item.key}`} onClick={() => onReadinessChange?.("drafting")} />
    </div>
  ),
}));

vi.mock("./EpicChildrenBySprint", () => ({ EpicChildrenBySprint: () => null }));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: [], backlogCount: 0, mutate: vi.fn() }),
  useSprintSlots: () => ({ data: [] }),
  useTickets: () => ({ data: undefined, mutate: vi.fn() }),
}));

const mockUpdateMetadata = vi.fn();
vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(async () => []),
  apiFetch: vi.fn(),
  tickets: {
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
  },
  jira: {},
  refinementSessions: {
    listUrl: () => "/api/refinement-sessions",
    update: vi.fn().mockResolvedValue({}),
  },
  settings: {
    getSectionVisibility: vi.fn().mockResolvedValue(null),
    saveSectionVisibility: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {},
}));

const CHILDREN: EpicChild[] = [
  { key: "VPL-10", title: "First story", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: 3, businessValue: 7, sprintName: null, subtaskCount: 0, readiness: null, jiraRank: null },
];

function renderSection({ withOptimistic = true } = {}) {
  const onMutate = vi.fn();
  const onChildOptimistic = vi.fn();
  render(
    <EpicChildrenSection
      items={CHILDREN}
      ticketKey="VPL-1"
      onMutate={onMutate}
      onChildOptimistic={withOptimistic ? onChildOptimistic : undefined}
    />,
  );
  return { onMutate, onChildOptimistic };
}

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }));
}

describe("EpicChildrenSection optimistic child patches (BRDG-334)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("patches the child status optimistically and skips the redundant revalidation", async () => {
    mockFetchOnce({ status: "IN PROGRESS" });
    const { onMutate, onChildOptimistic } = renderSection();

    fireEvent.click(screen.getByLabelText("set-status-VPL-10"));

    expect(onChildOptimistic).toHaveBeenCalledWith("VPL-10", { jiraStatus: "IN PROGRESS" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/tickets/VPL-10/status",
      expect.objectContaining({ method: "PUT" }),
    ));
    expect(onMutate).not.toHaveBeenCalled();
  });

  it("revalidates to roll back when the status write fails", async () => {
    mockFetchOnce({ error: "nope" }, false);
    const { onMutate, onChildOptimistic } = renderSection();

    fireEvent.click(screen.getByLabelText("set-status-VPL-10"));

    expect(onChildOptimistic).toHaveBeenCalledWith("VPL-10", { jiraStatus: "IN PROGRESS" });
    await waitFor(() => expect(onMutate).toHaveBeenCalled());
  });

  it("falls back to a bare revalidation when no optimistic handler is wired", async () => {
    mockFetchOnce({ status: "IN PROGRESS" });
    const { onMutate } = renderSection({ withOptimistic: false });

    fireEvent.click(screen.getByLabelText("set-status-VPL-10"));

    await waitFor(() => expect(onMutate).toHaveBeenCalled());
  });

  it("patches readiness optimistically and rolls back on failure", async () => {
    mockUpdateMetadata.mockRejectedValueOnce(new Error("boom"));
    const { onMutate, onChildOptimistic } = renderSection();

    fireEvent.click(screen.getByLabelText("set-readiness-VPL-10"));

    expect(onChildOptimistic).toHaveBeenCalledWith("VPL-10", { readiness: "drafting" });
    await waitFor(() => expect(onMutate).toHaveBeenCalled());
  });

  it("keeps the readiness patch without revalidating on success", async () => {
    mockUpdateMetadata.mockResolvedValueOnce({});
    const { onMutate, onChildOptimistic } = renderSection();

    fireEvent.click(screen.getByLabelText("set-readiness-VPL-10"));

    await waitFor(() => expect(mockUpdateMetadata).toHaveBeenCalledWith("VPL-10", { readiness: "drafting" }));
    expect(onChildOptimistic).toHaveBeenCalledWith("VPL-10", { readiness: "drafting" });
    expect(onMutate).not.toHaveBeenCalled();
  });
});
