import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicChildrenSection } from "./EpicChildrenSection";
import type { EpicChild } from "@/types/ticket";

// BRDG-309: the drop -> Create Sprint modal -> move flow. jsdom cannot complete a
// real drag across droppables, so EpicChildrenBySprint is stubbed to expose its
// onPlanNextSprint callback via a button. That lets us drive the create flow that a
// drop onto the create zone would trigger, and assert the modal/move/confirm wiring.
let lastPlanProps: { onPlanNextSprint?: (childKey: string) => void } = {};
vi.mock("./EpicChildrenBySprint", () => ({
  EpicChildrenBySprint: (props: { onPlanNextSprint?: (childKey: string) => void }) => {
    lastPlanProps = props;
    return (
      <button type="button" onClick={() => props.onPlanNextSprint?.("VPL-11")}>
        drop-on-create-zone
      </button>
    );
  },
}));

const mockCreateSprint = vi.fn();
const mockMoveSprint = vi.fn();
const mockMutateSprints = vi.fn();

// Raw sprint shape (id: number) as the /api/jira/sprints response carries it. The
// highest regular sprint is BT: 139, so the predicted next name is BT: 140 (absent).
const RAW_SPRINTS = [
  { id: 138, name: "BT: 138", state: "active", startDate: "2026-05-22", endDate: "2026-06-04", goal: null },
  { id: 139, name: "BT: 139", state: "future", startDate: "2026-06-05", endDate: "2026-06-18", goal: null },
];

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: RAW_SPRINTS, backlogCount: 0, mutate: mockMutateSprints }),
  useSprintSlots: () => ({ data: [] }),
  // ChildIssueRow -> useTicketHoverData reads this during the brief initial list render.
  useTickets: () => ({ data: undefined, mutate: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(async () => []),
  apiFetch: vi.fn(async () => ({})),
  tickets: {
    createChildIssue: vi.fn(),
    searchForLink: vi.fn().mockResolvedValue({ results: [], hasMore: false }),
    searchForLinkWithJira: vi.fn().mockResolvedValue({ results: [], hasMore: false }),
    updateEpic: vi.fn(),
    updateStoryPoints: vi.fn(),
    updateMetadata: vi.fn(),
    toggleFlag: vi.fn(),
    updateLabels: vi.fn(),
    get: vi.fn(),
  },
  jira: {
    createSprint: (...args: unknown[]) => mockCreateSprint(...args),
    moveSprint: (...args: unknown[]) => mockMoveSprint(...args),
    rank: vi.fn(),
    assign: vi.fn(),
  },
  refinementSessions: {
    listUrl: () => "/api/refinement-sessions",
    update: vi.fn().mockResolvedValue({}),
  },
  settings: {
    getSectionVisibility: vi.fn().mockResolvedValue({ visible: null }),
    saveSectionVisibility: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {},
}));

const CHILDREN: EpicChild[] = [
  { key: "VPL-11", title: "Loose story", type: "story", jiraStatus: "TO DO", assignee: null, flagged: false, storyPoints: null, businessValue: null, sprintName: "BT: 139", subtaskCount: 0, readiness: null, jiraRank: null },
];

function renderSection() {
  // Sprint view is where the create zone (and thus onPlanNextSprint) lives.
  localStorage.setItem("epic-children-view", '"sprint"');
  const onMutate = vi.fn();
  render(<EpicChildrenSection items={CHILDREN} ticketKey="VPL-1" onMutate={onMutate} />);
  return { onMutate };
}

function openCreateZoneDrop() {
  fireEvent.click(screen.getByText("drop-on-create-zone"));
}

describe("EpicChildrenSection create-the-next-sprint flow (BRDG-309)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    lastPlanProps = {};
    mockMoveSprint.mockResolvedValue({});
    // The created sprint joins the refreshed list, so its name resolves for the toast.
    mockMutateSprints.mockResolvedValue({
      sprints: [...RAW_SPRINTS, { id: 999, name: "BT: 140", state: "future", startDate: null, endDate: null, goal: null }],
      backlogCount: 0,
    });
  });

  it("passes onPlanNextSprint down to the by-sprint view", async () => {
    // The by-sprint view is restored from the account-scoped setting (BRDG-343),
    // imported once from the seeded localStorage value, so it resolves async.
    renderSection();
    await waitFor(() => expect(typeof lastPlanProps.onPlanNextSprint).toBe("function"));
  });

  it("opens the Create Sprint modal prefilled with the predicted name", () => {
    renderSection();
    openCreateZoneDrop();
    // Highest visible regular is BT: 139 -> predicted next is BT: 140.
    expect(screen.getByDisplayValue("BT: 140")).toBeInTheDocument();
    // It is the Create Sprint modal, and it names the sprint this one follows.
    expect(screen.getByText("Create Sprint")).toBeInTheDocument();
    expect(screen.getByText("BT: 139")).toBeInTheDocument();
  });

  it("on create, moves the dragged child into the new sprint and confirms", async () => {
    mockCreateSprint.mockResolvedValue({ id: 999, name: "BT: 140", state: "future", startDate: null, endDate: null, goal: null });
    const { onMutate } = renderSection();
    openCreateZoneDrop();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mockCreateSprint).toHaveBeenCalledWith(expect.objectContaining({ name: "BT: 140" }));
    });
    await waitFor(() => {
      expect(mockMoveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-11"], targetSprintId: "999" });
    });
    await waitFor(() => {
      expect(onMutate).toHaveBeenCalled();
    });
    // Follow-up confirmation naming both the child and the new sprint.
    await waitFor(() => {
      expect(screen.getByText("Moved VPL-11 into BT: 140")).toBeInTheDocument();
    });
  });

  it("cancelling the modal creates nothing and moves nothing", () => {
    renderSection();
    openCreateZoneDrop();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockCreateSprint).not.toHaveBeenCalled();
    expect(mockMoveSprint).not.toHaveBeenCalled();
    // Modal is gone.
    expect(screen.queryByText("Create Sprint")).not.toBeInTheDocument();
  });

  it("reports an honest partial state when the move fails after the sprint is created", async () => {
    mockCreateSprint.mockResolvedValue({ id: 999, name: "BT: 140", state: "future", startDate: null, endDate: null, goal: null });
    mockMoveSprint.mockRejectedValue(new Error("Jira rejected"));
    renderSection();
    openCreateZoneDrop();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByText(/Sprint created, but moving VPL-11 into it failed/)).toBeInTheDocument();
    });
  });
});
