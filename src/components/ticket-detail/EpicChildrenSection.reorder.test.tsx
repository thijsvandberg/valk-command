import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicChildrenSection } from "./EpicChildrenSection";
import type { EpicChild } from "@/types/ticket";

const mockRank = vi.fn();
const mockMoveSprint = vi.fn();
const mockGetSectionVisibility = vi.fn();

// dnd-kit's KeyboardSensor needs real layout rects to move a sortable, which jsdom
// lacks, so the by-sprint view is mocked to expose onReorderChild directly. This
// isolates the parent's reorder handler (rank call + optimistic order + revert).
let lastItems: (EpicChild | { key: string })[] = [];
let lastSprints: { id: string; name: string }[] = [];
vi.mock("./EpicChildrenBySprint", () => ({
  EpicChildrenBySprint: (props: {
    items: (EpicChild | { key: string })[];
    sprints: { id: string; name: string }[];
    onReorderChild?: (r: {
      activeKey: string;
      groupKey: string;
      sprintName: string | null;
      newOrder: string[];
      rankBeforeKey?: string;
      rankAfterKey?: string;
    }) => void;
    onMoveChildToPosition?: (m: {
      activeKey: string;
      targetSprintId: string;
      targetGroupKey: string;
      targetSprintName: string | null;
      newOrder: string[];
      rankBeforeKey?: string;
      rankAfterKey?: string;
    }) => void;
  }) => {
    lastItems = props.items;
    lastSprints = props.sprints;
    return (
      <>
        <button
          type="button"
          onClick={() =>
            props.onReorderChild?.({
              activeKey: "VPL-41",
              groupKey: "Sprint 1",
              sprintName: "Sprint 1",
              newOrder: ["VPL-41", "VPL-40"],
              rankBeforeKey: "VPL-40",
            })
          }
        >
          trigger-reorder
        </button>
        <button
          type="button"
          onClick={() =>
            props.onMoveChildToPosition?.({
              activeKey: "VPL-41",
              targetSprintId: "2",
              targetGroupKey: "Sprint 2",
              targetSprintName: "Sprint 2",
              newOrder: ["VPL-41"],
              rankBeforeKey: "VPL-50",
            })
          }
        >
          trigger-move-to-position
        </button>
      </>
    );
  },
}));

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(async (url: string) => {
    if (typeof url === "string" && url.startsWith("/api/jira/sprints")) {
      return {
        sprints: [{ id: 1, name: "Sprint 1", state: "active", startDate: "2026-06-01", endDate: "2026-06-14", goal: null }],
        backlogCount: 0,
      };
    }
    return [];
  }),
  apiFetch: vi.fn().mockResolvedValue({}),
  tickets: {
    createChildIssue: vi.fn(),
    searchForLink: vi.fn().mockResolvedValue({ results: [] }),
    searchForLinkWithJira: vi.fn().mockResolvedValue({ results: [] }),
    updateEpic: vi.fn(),
    updateStoryPoints: vi.fn(),
    updateMetadata: vi.fn(),
    toggleFlag: vi.fn(),
    updateLabels: vi.fn(),
    get: vi.fn(),
  },
  jira: {
    rank: (...args: unknown[]) => mockRank(...args),
    moveSprint: (...args: unknown[]) => mockMoveSprint(...args),
    assign: vi.fn(),
  },
  refinementSessions: { listUrl: () => "/api/refinement-sessions", update: vi.fn() },
  settings: {
    getSectionVisibility: (...args: unknown[]) => mockGetSectionVisibility(...args),
    saveSectionVisibility: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {},
}));

const CHILDREN: EpicChild[] = [
  { key: "VPL-40", title: "First", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: 1, businessValue: 1, sprintName: "Sprint 1", subtaskCount: 0, readiness: null, jiraRank: 0 },
  { key: "VPL-41", title: "Second", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: 1, businessValue: 1, sprintName: "Sprint 1", subtaskCount: 0, readiness: null, jiraRank: 1 },
];

function renderSection() {
  const onMutate = vi.fn();
  render(<EpicChildrenSection items={CHILDREN} ticketKey="VPL-1" onMutate={onMutate} />);
  return { onMutate };
}

function switchToSprintView() {
  // The view toggle now lives in the menu's View pane; open it, switch to View, pick By sprint, close.
  fireEvent.click(screen.getByRole("button", { name: "List options" }));
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  fireEvent.click(screen.getByRole("radio", { name: "By sprint" }));
  fireEvent.click(screen.getByRole("button", { name: "List options" }));
}

describe("EpicChildrenSection reorder handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    lastItems = [];
    mockRank.mockResolvedValue({});
    mockMoveSprint.mockResolvedValue({});
    mockGetSectionVisibility.mockResolvedValue({ visible: null });
  });

  it("persists the rank, resolving the sprint id from the group name", async () => {
    const { onMutate } = renderSection();
    switchToSprintView();
    // Wait for useJiraSprints (SWR) to load so the handler can resolve the sprint id.
    await waitFor(() => expect(lastSprints.length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText("trigger-reorder"));

    await waitFor(() => {
      expect(mockRank).toHaveBeenCalledWith({ issueKeys: ["VPL-41"], rankBeforeKey: "VPL-40", sprintId: "1" });
    });
    await waitFor(() => expect(onMutate).toHaveBeenCalled());
  });

  it("optimistically applies the new within-group order", async () => {
    renderSection();
    switchToSprintView();
    expect(lastItems.map((i) => i.key)).toEqual(["VPL-40", "VPL-41"]);

    fireEvent.click(screen.getByText("trigger-reorder"));

    await waitFor(() => {
      expect(lastItems.map((i) => i.key)).toEqual(["VPL-41", "VPL-40"]);
    });
  });

  it("reverts the optimistic order and warns when the rank call fails", async () => {
    mockRank.mockRejectedValue(new Error("Jira rejected"));
    renderSection();
    switchToSprintView();

    fireEvent.click(screen.getByText("trigger-reorder"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to reorder VPL-41/)).toBeInTheDocument();
    });
    // Reverted back to the server order.
    expect(lastItems.map((i) => i.key)).toEqual(["VPL-40", "VPL-41"]);
  });

  it("moves to a position by persisting the sprint move then the rank", async () => {
    renderSection();
    switchToSprintView();
    await waitFor(() => expect(lastSprints.length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText("trigger-move-to-position"));

    await waitFor(() => {
      expect(mockMoveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-41"], targetSprintId: "2" });
    });
    await waitFor(() => {
      expect(mockRank).toHaveBeenCalledWith({ issueKeys: ["VPL-41"], rankBeforeKey: "VPL-50", sprintId: "2" });
    });
    // Rank runs only after the move resolves.
    expect(mockMoveSprint.mock.invocationCallOrder[0]).toBeLessThan(mockRank.mock.invocationCallOrder[0]);
  });

  it("reverts the optimistic move-to-position and warns when the move fails", async () => {
    mockMoveSprint.mockRejectedValue(new Error("Jira rejected"));
    renderSection();
    switchToSprintView();
    await waitFor(() => expect(lastSprints.length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText("trigger-move-to-position"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to move VPL-41 to sprint/)).toBeInTheDocument();
    });
    expect(mockRank).not.toHaveBeenCalled();
  });
});
