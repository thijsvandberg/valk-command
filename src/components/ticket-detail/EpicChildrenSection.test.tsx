import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicChildrenSection } from "./EpicChildrenSection";
import type { EpicChild } from "@/types/ticket";

const mockCreateChildIssue = vi.fn();
const mockSearchForLink = vi.fn();
const mockSearchForLinkWithJira = vi.fn();
const mockUpdateEpic = vi.fn();
const mockUpdateStoryPoints = vi.fn();
const mockUpdateMetadata = vi.fn();
const mockGetSectionVisibility = vi.fn();
const mockMoveSprint = vi.fn();
const mockRank = vi.fn();
const mockApiFetch = vi.fn();
const mockAssign = vi.fn();
const mockToggleFlag = vi.fn();
const mockUpdateLabels = vi.fn();
const mockGet = vi.fn();
vi.mock("@/lib/api-client", () => ({
  // ChildIssueRow → useTicketHoverData → useTickets/useJiraSprints read swrFetcher.
  // The by-sprint view reads sprint metadata (state/dates) from /api/jira/sprints.
  swrFetcher: vi.fn(async (url: string) => {
    if (typeof url === "string" && url.startsWith("/api/jira/sprints")) {
      return {
        sprints: [
          { id: 1, name: "Sprint 1", state: "active", startDate: "2026-06-01", endDate: "2026-06-14", goal: null },
          { id: 2, name: "Sprint 2", state: "closed", startDate: "2026-05-01", endDate: "2026-05-14", goal: null },
          // A future sprint with no children: only reachable via the move menu.
          { id: 3, name: "Sprint 3", state: "future", startDate: "2026-07-01", endDate: "2026-07-14", goal: null },
        ],
        backlogCount: 0,
      };
    }
    return [];
  }),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  tickets: {
    createChildIssue: (...args: unknown[]) => mockCreateChildIssue(...args),
    searchForLink: (...args: unknown[]) => mockSearchForLink(...args),
    searchForLinkWithJira: (...args: unknown[]) => mockSearchForLinkWithJira(...args),
    updateEpic: (...args: unknown[]) => mockUpdateEpic(...args),
    updateStoryPoints: (...args: unknown[]) => mockUpdateStoryPoints(...args),
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
    toggleFlag: (...args: unknown[]) => mockToggleFlag(...args),
    updateLabels: (...args: unknown[]) => mockUpdateLabels(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
  jira: {
    moveSprint: (...args: unknown[]) => mockMoveSprint(...args),
    rank: (...args: unknown[]) => mockRank(...args),
    assign: (...args: unknown[]) => mockAssign(...args),
  },
  refinementSessions: {
    listUrl: () => "/api/refinement-sessions",
    update: vi.fn().mockResolvedValue({}),
  },
  settings: {
    getSectionVisibility: (...args: unknown[]) => mockGetSectionVisibility(...args),
    saveSectionVisibility: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {},
}));

const SAMPLE_CHILDREN: EpicChild[] = [
  { key: "VPL-10", title: "First story", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: 3, businessValue: 7, sprintName: "Sprint 1", subtaskCount: 2, readiness: null, jiraRank: null },
  { key: "VPL-11", title: "Second task", type: "task", jiraStatus: "IN PROGRESS", assignee: null, storyPoints: null, businessValue: null, sprintName: null, subtaskCount: 0, readiness: "drafting", jiraRank: null },
  { key: "VPL-12", title: "Done story", type: "story", jiraStatus: "DONE", assignee: null, storyPoints: 5, businessValue: 6, sprintName: "Sprint 1", subtaskCount: 1, readiness: null, jiraRank: null },
];

function renderSection(items: EpicChild[] = []) {
  const onMutate = vi.fn();
  const onSelectTicket = vi.fn();
  const result = render(
    <EpicChildrenSection
      items={items}
      ticketKey="VPL-1"
      onMutate={onMutate}
      onSelectTicket={onSelectTicket}
    />,
  );
  return { ...result, onMutate, onSelectTicket };
}

function openFilterPopover() {
  const filterBtn = screen.getByTitle("Filter and display options");
  fireEvent.click(filterBtn);
}

function openSearchMode() {
  const searchBtn = screen.getByTitle("Link existing issue");
  fireEvent.click(searchBtn);
}

describe("EpicChildrenSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockSearchForLink.mockResolvedValue({ results: [], hasMore: false });
    mockSearchForLinkWithJira.mockResolvedValue({ results: [], hasMore: false });
    mockGetSectionVisibility.mockResolvedValue({ visible: null });
    mockMoveSprint.mockResolvedValue({});
    mockRank.mockResolvedValue({});
    mockUpdateStoryPoints.mockResolvedValue({ storyPoints: null });
    mockUpdateMetadata.mockResolvedValue({});
    mockApiFetch.mockResolvedValue({});
    mockAssign.mockResolvedValue({});
    mockToggleFlag.mockResolvedValue({ flagged: true });
    mockUpdateLabels.mockResolvedValue({ labels: [] });
    mockGet.mockResolvedValue({ labels: [] });
    mockUpdateEpic.mockResolvedValue({ epic: null, epicKey: null });
  });

  describe("inline creation", () => {
    it("renders input with placeholder", () => {
      renderSection();
      expect(screen.getByPlaceholderText("Create child issue...")).toBeInTheDocument();
    });

    it("renders input below existing items", () => {
      renderSection(SAMPLE_CHILDREN);
      expect(screen.getByText("VPL-10")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Create child issue...")).toBeInTheDocument();
    });

    it("creates child issue on Enter", async () => {
      mockCreateChildIssue.mockResolvedValue({
        key: "VPL-999",
        title: "New child",
        type: "story",
        jiraStatus: "TO DO",
        assignee: null,
      });

      const { onMutate } = renderSection();
      const input = screen.getByPlaceholderText("Create child issue...");
      fireEvent.change(input, { target: { value: "New child" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(input).toHaveValue("");

      await waitFor(() => {
        expect(mockCreateChildIssue).toHaveBeenCalledWith(
          "VPL-1",
          { title: "New child", issueType: "Story" },
        );
      });

      await waitFor(() => {
        expect(onMutate).toHaveBeenCalled();
      });
    });

    it("shows placeholder row during creation", async () => {
      mockCreateChildIssue.mockImplementation(() => new Promise(() => {}));

      renderSection();
      const input = screen.getByPlaceholderText("Create child issue...");
      fireEvent.change(input, { target: { value: "Pending item" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(screen.getByText("Pending item")).toBeInTheDocument();
    });

    it("shows error on creation failure", async () => {
      mockCreateChildIssue.mockRejectedValue(new Error("Network error"));

      renderSection();
      const input = screen.getByPlaceholderText("Create child issue...");
      fireEvent.change(input, { target: { value: "Failing item" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText(/Failed to create child issue/)).toBeInTheDocument();
      });
    });

    it("shows a confirmation toast after creating a child", async () => {
      mockCreateChildIssue.mockResolvedValue({
        key: "VPL-999",
        title: "New child",
        type: "story",
        jiraStatus: "TO DO",
        assignee: null,
      });

      renderSection();
      const input = screen.getByPlaceholderText("Create child issue...");
      fireEvent.change(input, { target: { value: "New child" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("VPL-999 created")).toBeInTheDocument();
      });
    });

    it("clears input on Escape", () => {
      renderSection();
      const input = screen.getByPlaceholderText("Create child issue...");
      fireEvent.change(input, { target: { value: "Something" } });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(input).toHaveValue("");
    });

    it("does not submit on empty input", () => {
      renderSection();
      const input = screen.getByPlaceholderText("Create child issue...");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(mockCreateChildIssue).not.toHaveBeenCalled();
    });
  });

  describe("type selector", () => {
    it("defaults to Story type", () => {
      renderSection();
      expect(screen.getByText("Story")).toBeInTheDocument();
    });

    it("shows type picker on click and selects a type", async () => {
      renderSection();
      fireEvent.click(screen.getByText("Story"));

      await waitFor(() => {
        expect(screen.getByText("Task")).toBeInTheDocument();
        expect(screen.getByText("Bug")).toBeInTheDocument();
        expect(screen.getByText("Spike")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Task"));

      mockCreateChildIssue.mockResolvedValue({
        key: "VPL-999",
        title: "A task",
        type: "task",
        jiraStatus: "TO DO",
        assignee: null,
      });

      const input = screen.getByPlaceholderText("Create child issue...");
      fireEvent.change(input, { target: { value: "A task" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(mockCreateChildIssue).toHaveBeenCalledWith(
          "VPL-1",
          { title: "A task", issueType: "Task" },
        );
      });
    });
  });

  describe("filter popover", () => {
    it("shows filter button", () => {
      renderSection(SAMPLE_CHILDREN);
      expect(screen.getByTitle("Filter and display options")).toBeInTheDocument();
    });

    it("opens popover with status filters on click", () => {
      renderSection(SAMPLE_CHILDREN);
      openFilterPopover();

      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("To Do")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    it("filters items when selecting a status", () => {
      renderSection(SAMPLE_CHILDREN);
      openFilterPopover();

      fireEvent.click(screen.getByText("To Do"));

      expect(screen.getByText("VPL-10")).toBeInTheDocument();
      expect(screen.queryByText("VPL-11")).not.toBeInTheDocument();
      expect(screen.queryByText("VPL-12")).not.toBeInTheDocument();
    });

    it("hides deprecated children by default and shows them when the toggle is turned off", () => {
      const withDeprecated: EpicChild[] = [
        ...SAMPLE_CHILDREN,
        { key: "VPL-99", title: "Old story", type: "story", jiraStatus: "DEPRECATED", assignee: null, storyPoints: null, businessValue: null, sprintName: null, subtaskCount: 0, readiness: null, jiraRank: null },
      ];
      renderSection(withDeprecated);

      // Hidden by default
      expect(screen.queryByText("VPL-99")).not.toBeInTheDocument();

      openFilterPopover();
      expect(screen.getByText("Hide deprecated")).toBeInTheDocument();

      // Turning the toggle off reveals the deprecated child
      fireEvent.click(screen.getByText("Hide deprecated"));
      expect(screen.getByText("VPL-99")).toBeInTheDocument();
    });

    it("does not show the Hide deprecated toggle when there are no deprecated children", () => {
      renderSection(SAMPLE_CHILDREN);
      openFilterPopover();
      expect(screen.queryByText("Hide deprecated")).not.toBeInTheDocument();
    });

    it("shows field visibility toggles", () => {
      renderSection(SAMPLE_CHILDREN);
      openFilterPopover();

      expect(screen.getByText("Columns")).toBeInTheDocument();
      expect(screen.getByText("Issue keys")).toBeInTheDocument();
      expect(screen.getAllByText("Status")).toHaveLength(2);
      expect(screen.getByText("Story points")).toBeInTheDocument();
      expect(screen.getByText("Sprint")).toBeInTheDocument();
      expect(screen.getByText("Subtask count")).toBeInTheDocument();
      expect(screen.getByText("Assignees")).toBeInTheDocument();
    });
  });

  describe("additional columns", () => {
    it("shows story points", () => {
      renderSection(SAMPLE_CHILDREN);
      const spBadges = screen.getAllByText("3");
      expect(spBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("shows sprint name", () => {
      renderSection(SAMPLE_CHILDREN);
      const sprintLabels = screen.getAllByText("Sprint 1");
      expect(sprintLabels.length).toBeGreaterThanOrEqual(1);
    });

    it("shows subtask count as open/total", () => {
      renderSection(SAMPLE_CHILDREN);
      // VPL-10 has 2 subtasks; with no open count it reads 0/2 (shared open/total badge).
      const badges = screen.getAllByText("0/2");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it("shows business value for children that have it", () => {
      renderSection(SAMPLE_CHILDREN);
      expect(screen.getByLabelText("Business Value: 7")).toBeInTheDocument();
      expect(screen.getByLabelText("Business Value: 6")).toBeInTheDocument();
    });
  });

  describe("inline metric editing", () => {
    it("sets story points on a child that has none yet", async () => {
      const { onMutate, onSelectTicket } = renderSection(SAMPLE_CHILDREN);
      // VPL-11 is the only child without story points.
      fireEvent.click(screen.getByLabelText("Set Story Points"));
      // 8 is not a value any sample child carries, so it is unambiguous.
      fireEvent.click(screen.getByText("8"));

      await waitFor(() => {
        expect(mockUpdateStoryPoints).toHaveBeenCalledWith("VPL-11", 8);
      });
      await waitFor(() => expect(onMutate).toHaveBeenCalled());
      // Editing the metric must not open the ticket.
      expect(onSelectTicket).not.toHaveBeenCalled();
    });

    it("sets business value on a child that has none yet", async () => {
      const { onMutate } = renderSection(SAMPLE_CHILDREN);
      fireEvent.click(screen.getByLabelText("Set Business Value"));
      // 4 is carried by no sample child.
      fireEvent.click(screen.getByText("4"));

      await waitFor(() => {
        expect(mockUpdateMetadata).toHaveBeenCalledWith("VPL-11", { businessValue: 4 });
      });
      await waitFor(() => expect(onMutate).toHaveBeenCalled());
    });

    it("renders editable metric pickers for every child, including empty ones", () => {
      renderSection(SAMPLE_CHILDREN);
      // VPL-11 carries neither metric yet but still exposes settable pickers.
      expect(screen.getByLabelText("Set Story Points")).toBeInTheDocument();
      expect(screen.getByLabelText("Set Business Value")).toBeInTheDocument();
    });

    it("sets story points via keyboard while the popover is open", async () => {
      renderSection(SAMPLE_CHILDREN);
      fireEvent.click(screen.getByLabelText("Set Story Points"));
      // 8 is a preset; typing it commits without clicking.
      fireEvent.keyDown(document, { key: "8" });

      await waitFor(() => {
        expect(mockUpdateStoryPoints).toHaveBeenCalledWith("VPL-11", 8);
      });
    });

    it("sets business value via keyboard while the popover is open", async () => {
      renderSection(SAMPLE_CHILDREN);
      fireEvent.click(screen.getByLabelText("Set Business Value"));
      fireEvent.keyDown(document, { key: "4" });

      await waitFor(() => {
        expect(mockUpdateMetadata).toHaveBeenCalledWith("VPL-11", { businessValue: 4 });
      });
    });

    it("shows the chosen story points immediately, before the refetch resolves", async () => {
      // onMutate never feeds new items back, so a visible value can only come from
      // the optimistic override.
      renderSection(SAMPLE_CHILDREN);
      fireEvent.click(screen.getByLabelText("Set Story Points"));
      fireEvent.click(screen.getByText("8"));

      await waitFor(() => {
        expect(screen.getByLabelText("Story Points: 8")).toBeInTheDocument();
      });
    });

    it("shows the chosen business value immediately, before the refetch resolves", async () => {
      renderSection(SAMPLE_CHILDREN);
      fireEvent.click(screen.getByLabelText("Set Business Value"));
      fireEvent.click(screen.getByText("4"));

      await waitFor(() => {
        expect(screen.getByLabelText("Business Value: 4")).toBeInTheDocument();
      });
    });

    it("reverts the optimistic story points if the save fails", async () => {
      mockUpdateStoryPoints.mockRejectedValue(new Error("boom"));
      renderSection(SAMPLE_CHILDREN);
      fireEvent.click(screen.getByLabelText("Set Story Points"));
      fireEvent.click(screen.getByText("8"));

      await waitFor(() => {
        expect(screen.getByText(/Failed to update story points/)).toBeInTheDocument();
      });
      // The override is rolled back, so the child is settable (empty) again.
      expect(screen.getByLabelText("Set Story Points")).toBeInTheDocument();
      expect(screen.queryByLabelText("Story Points: 8")).not.toBeInTheDocument();
    });
  });

  describe("link existing (search mode)", () => {
    it("shows search button in create row", () => {
      renderSection();
      expect(screen.getByTitle("Link existing issue")).toBeInTheDocument();
    });

    it("switches to search mode when clicking search button", () => {
      renderSection();
      openSearchMode();
      expect(screen.getByPlaceholderText("Search by key or title...")).toBeInTheDocument();
    });

    it("shows search results after typing", async () => {
      mockSearchForLink.mockResolvedValue({ results: [
        { key: "VPL-50", title: "Existing ticket", type: "story", status: "TO DO", source: "local" },
      ], hasMore: false });

      renderSection();
      openSearchMode();

      const searchInput = screen.getByPlaceholderText("Search by key or title...");
      fireEvent.change(searchInput, { target: { value: "VPL-50" } });

      await waitFor(() => {
        expect(screen.getByText("Existing ticket")).toBeInTheDocument();
      });
    });

    it("links existing ticket on click", async () => {
      mockSearchForLink.mockResolvedValue({ results: [
        { key: "VPL-50", title: "Existing ticket", type: "story", status: "TO DO", source: "local" },
      ], hasMore: false });
      mockUpdateEpic.mockResolvedValue({ epic: "Epic VPL-1", epicKey: "VPL-1" });

      const { onMutate } = renderSection();
      openSearchMode();

      const searchInput = screen.getByPlaceholderText("Search by key or title...");
      fireEvent.change(searchInput, { target: { value: "VPL-50" } });

      await waitFor(() => {
        expect(screen.getByText("Existing ticket")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Existing ticket"));

      await waitFor(() => {
        expect(mockUpdateEpic).toHaveBeenCalledWith("VPL-50", "VPL-1");
      });

      await waitFor(() => {
        expect(onMutate).toHaveBeenCalled();
      });
    });

    it("shows a confirmation toast after linking an existing ticket", async () => {
      mockSearchForLink.mockResolvedValue({ results: [
        { key: "VPL-50", title: "Existing ticket", type: "story", status: "TO DO", source: "local" },
      ], hasMore: false });
      mockUpdateEpic.mockResolvedValue({ epic: "Epic VPL-1", epicKey: "VPL-1" });

      renderSection();
      openSearchMode();

      const searchInput = screen.getByPlaceholderText("Search by key or title...");
      fireEvent.change(searchInput, { target: { value: "VPL-50" } });

      await waitFor(() => {
        expect(screen.getByText("Existing ticket")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Existing ticket"));

      await waitFor(() => {
        expect(screen.getByText("VPL-50 linked")).toBeInTheDocument();
      });
    });

    it("closes search on Cancel", () => {
      renderSection();
      openSearchMode();
      expect(screen.getByPlaceholderText("Search by key or title...")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Cancel"));
      expect(screen.queryByPlaceholderText("Search by key or title...")).not.toBeInTheDocument();
    });

    it("closes search on Escape", () => {
      renderSection();
      openSearchMode();
      const searchInput = screen.getByPlaceholderText("Search by key or title...");

      fireEvent.keyDown(searchInput, { key: "Escape" });
      expect(screen.queryByPlaceholderText("Search by key or title...")).not.toBeInTheDocument();
    });

    it("excludes already-linked children from results", async () => {
      mockSearchForLink.mockResolvedValue({ results: [
        { key: "VPL-10", title: "First story", type: "story", status: "TO DO", source: "local" },
        { key: "VPL-50", title: "New ticket", type: "task", status: "TO DO", source: "local" },
      ], hasMore: false });

      renderSection(SAMPLE_CHILDREN);
      openSearchMode();

      const searchInput = screen.getByPlaceholderText("Search by key or title...");
      fireEvent.change(searchInput, { target: { value: "VPL" } });

      await waitFor(() => {
        expect(screen.getByText("New ticket")).toBeInTheDocument();
      });

      const resultButtons = screen.getAllByRole("button").filter(
        (b) => b.textContent?.includes("New ticket"),
      );
      expect(resultButtons.length).toBe(1);
    });

    it("shows error when linking fails", async () => {
      mockSearchForLink.mockResolvedValue({ results: [
        { key: "VPL-50", title: "Fail ticket", type: "story", status: "TO DO", source: "local" },
      ], hasMore: false });
      mockUpdateEpic.mockRejectedValue(new Error("API error"));

      renderSection();
      openSearchMode();

      const searchInput = screen.getByPlaceholderText("Search by key or title...");
      fireEvent.change(searchInput, { target: { value: "VPL-50" } });

      await waitFor(() => {
        expect(screen.getByText("Fail ticket")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Fail ticket"));

      await waitFor(() => {
        expect(screen.getByText(/Failed to link VPL-50/)).toBeInTheDocument();
      });
    });
  });

  describe("navigation", () => {
    it("calls onSelectTicket when clicking a child", () => {
      const { onSelectTicket } = renderSection(SAMPLE_CHILDREN);
      fireEvent.click(screen.getByText("First story"));
      expect(onSelectTicket).toHaveBeenCalledWith("VPL-10", expect.anything());
    });
  });

  describe("by-sprint view", () => {
    function switchToSprintView() {
      fireEvent.click(screen.getByRole("radio", { name: "By sprint" }));
    }

    it("renders the List / By sprint toggle", () => {
      renderSection(SAMPLE_CHILDREN);
      expect(screen.getByRole("radio", { name: "List" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "By sprint" })).toBeInTheDocument();
    });

    it("defaults to list view and persists the choice to localStorage", () => {
      renderSection(SAMPLE_CHILDREN);
      expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");

      switchToSprintView();

      expect(screen.getByRole("radio", { name: "By sprint" })).toHaveAttribute("aria-checked", "true");
      expect(localStorage.getItem("epic-children-view")).toBe('"sprint"');
    });

    it("restores the persisted view on mount", () => {
      localStorage.setItem("epic-children-view", '"sprint"');
      renderSection(SAMPLE_CHILDREN);
      expect(screen.getByRole("radio", { name: "By sprint" })).toHaveAttribute("aria-checked", "true");
    });

    it("groups children under per-sprint headers and an Unscheduled group", async () => {
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();

      await waitFor(() => {
        // Active sprint chip from the Sprint 1 metadata.
        expect(screen.getByText("Active")).toBeInTheDocument();
      });
      // The null-sprint child collects into the Unscheduled group.
      expect(screen.getByText("Unscheduled")).toBeInTheDocument();
      // Active sprint live dot from GroupStatBar.
      expect(screen.getByLabelText("Active sprint")).toBeInTheDocument();
    });

    it("orders sprint groups closed -> active (chronological)", async () => {
      const children: EpicChild[] = [
        { key: "VPL-20", title: "Active item", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: 1, businessValue: 4, sprintName: "Sprint 1", subtaskCount: 0, readiness: null, jiraRank: null },
        { key: "VPL-21", title: "Closed item", type: "story", jiraStatus: "DONE", assignee: null, storyPoints: 2, businessValue: 6, sprintName: "Sprint 2", subtaskCount: 0, readiness: null, jiraRank: null },
      ];
      renderSection(children);
      switchToSprintView();

      await waitFor(() => {
        expect(screen.getByText("Closed")).toBeInTheDocument();
      });
      const closedChip = screen.getByText("Closed");
      const activeChip = screen.getByText("Active");
      // Closed sprint group precedes the active one in document order.
      expect(closedChip.compareDocumentPosition(activeChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("creates a child into the targeted sprint via the group composer", async () => {
      mockCreateChildIssue.mockResolvedValue({
        key: "VPL-777", title: "Sprint-scoped", type: "story", jiraStatus: "TO DO", assignee: null,
      });
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();

      await waitFor(() => {
        expect(screen.getByLabelText("Create issue in Sprint 1")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText("Create issue in Sprint 1"));
      const input = screen.getByPlaceholderText("Create issue in Sprint 1...");
      fireEvent.change(input, { target: { value: "Sprint-scoped" } });
      fireEvent.keyDown(input, { key: "Enter" });

      // The optimistic placeholder appears immediately under the targeted sprint.
      expect(screen.getByText("Sprint-scoped")).toBeInTheDocument();

      await waitFor(() => {
        expect(mockCreateChildIssue).toHaveBeenCalledWith(
          "VPL-1",
          { title: "Sprint-scoped", issueType: "Story", sprintId: "1" },
        );
      });
    });

    it("shares the status filter with the list view", () => {
      renderSection(SAMPLE_CHILDREN);
      openFilterPopover();
      fireEvent.click(screen.getByText("Done"));

      switchToSprintView();

      expect(screen.getByText("Done story")).toBeInTheDocument();
      expect(screen.queryByText("First story")).not.toBeInTheDocument();
      expect(screen.queryByText("Second task")).not.toBeInTheDocument();
    });

    it("shares column visibility with the list view", () => {
      renderSection(SAMPLE_CHILDREN);
      openFilterPopover();
      // Hide the issue keys column.
      fireEvent.click(screen.getByText("Issue keys"));
      openFilterPopover();

      switchToSprintView();

      expect(screen.queryByText("VPL-10")).not.toBeInTheDocument();
      expect(screen.queryByText("VPL-12")).not.toBeInTheDocument();
    });

    it("does not repeat the sprint name as a per-row pill in the by-sprint view", () => {
      renderSection(SAMPLE_CHILDREN);
      // List view: "Sprint 1" shows as a pill on each of the two Sprint 1 rows.
      expect(screen.getAllByText("Sprint 1")).toHaveLength(2);

      switchToSprintView();

      // By-sprint view: "Sprint 1" appears only once, as the group header label.
      expect(screen.getAllByText("Sprint 1")).toHaveLength(1);
    });

    it("keeps the create child input available in sprint view", () => {
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();
      expect(screen.getByPlaceholderText("Create child issue...")).toBeInTheDocument();
    });

    it("renders only the create input when the epic has no children", () => {
      renderSection([]);
      switchToSprintView();
      expect(screen.getByPlaceholderText("Create child issue...")).toBeInTheDocument();
      expect(screen.queryByText("Unscheduled")).not.toBeInTheDocument();
    });

    it("filters a sprint group to its unpointed stories when the warning icon is clicked", async () => {
      const children: EpicChild[] = [
        { key: "VPL-30", title: "Estimated story", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: 3, businessValue: null, sprintName: "Sprint 1", subtaskCount: 0, readiness: null, jiraRank: null },
        { key: "VPL-31", title: "Unestimated story", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: null, businessValue: null, sprintName: "Sprint 1", subtaskCount: 0, readiness: null, jiraRank: null },
      ];
      renderSection(children);
      switchToSprintView();

      // Sprint 1 is active, so the unpointed-estimate warning appears and is clickable.
      const warning = await screen.findByLabelText(/without a story point estimate/);
      expect(screen.getByText("Estimated story")).toBeInTheDocument();
      expect(screen.getByText("Unestimated story")).toBeInTheDocument();

      fireEvent.click(warning);

      // Only the unpointed story stays visible once the filter is active.
      expect(screen.queryByText("Estimated story")).not.toBeInTheDocument();
      expect(screen.getByText("Unestimated story")).toBeInTheDocument();
    });

    function moveViaContextMenu(rowTitle: string, sprintLabel: string) {
      fireEvent.contextMenu(screen.getByText(rowTitle));
      fireEvent.click(screen.getByText("Move to Sprint"));
      fireEvent.click(screen.getByText(sprintLabel));
    }

    it("optimistically re-groups a child moved into a sprint with no current group", async () => {
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();
      // VPL-11 is the only Unscheduled child.
      expect(screen.getByText("Unscheduled")).toBeInTheDocument();

      // Sprint 3 (future, no children) is offered only by the menu.
      moveViaContextMenu("Second task", "Sprint 3");

      await waitFor(() => {
        expect(mockMoveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-11"], targetSprintId: "3" });
      });
      // Optimistically the row leaves Unscheduled and a Sprint 3 group appears.
      expect(screen.queryByText("Unscheduled")).not.toBeInTheDocument();
      expect(screen.getByText("Sprint 3")).toBeInTheDocument();
    });

    it("reverts the optimistic move and warns when the Jira move fails", async () => {
      mockMoveSprint.mockRejectedValue(new Error("Jira rejected"));
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();

      moveViaContextMenu("Second task", "Sprint 3");

      await waitFor(() => {
        expect(screen.getByText(/Failed to move 1 issue to sprint/)).toBeInTheDocument();
      });
      // Reverted: the row is back under Unscheduled and the Sprint 3 group is gone.
      expect(screen.getByText("Unscheduled")).toBeInTheDocument();
      expect(screen.queryByText("Sprint 3")).not.toBeInTheDocument();
    });

    it("exposes the full action menu on right-click, not just Move to Sprint", () => {
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();
      fireEvent.contextMenu(screen.getByText("First story"));
      for (const label of [
        "Set Status",
        "Set Readiness",
        "Set Epic",
        "Move to Sprint",
        "Update Assignee",
        "Add/Update Label",
        "Flag",
        "Review Story",
        "Generate Subtasks",
        "Add to Refinement",
      ]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it("flags only the right-clicked row when nothing is selected", async () => {
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();
      fireEvent.contextMenu(screen.getByText("First story"));
      fireEvent.click(screen.getByText("Flag"));
      await waitFor(() => {
        expect(mockToggleFlag).toHaveBeenCalledWith("VPL-10", true);
      });
      expect(mockToggleFlag).toHaveBeenCalledTimes(1);
    });

    it("acts on the whole selection when right-clicking a checked row", async () => {
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();
      fireEvent.click(screen.getByLabelText("Select VPL-10"));
      fireEvent.click(screen.getByLabelText("Select VPL-12"));
      fireEvent.contextMenu(screen.getByText("First story"));
      fireEvent.click(screen.getByText("Flag"));
      await waitFor(() => {
        expect(mockToggleFlag).toHaveBeenCalledTimes(2);
      });
      expect(mockToggleFlag).toHaveBeenCalledWith("VPL-10", true);
      expect(mockToggleFlag).toHaveBeenCalledWith("VPL-12", true);
    });
  });

  describe("multiselect bulk actions", () => {
    function selectRow(key: string) {
      fireEvent.click(screen.getByLabelText(`Select ${key}`));
    }
    function openBulkMenu(label: string) {
      fireEvent.click(screen.getByText("Update"));
      fireEvent.click(screen.getByText(label));
    }
    function switchToSprintView() {
      fireEvent.click(screen.getByRole("radio", { name: "By sprint" }));
    }

    it("shows the bulk toolbar with a count after checking a row", () => {
      renderSection(SAMPLE_CHILDREN);
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      selectRow("VPL-10");
      expect(screen.getByText(/1\/3 selected/)).toBeInTheDocument();
      expect(screen.getByText("Update")).toBeInTheDocument();
    });

    it("select-all checks every visible row and Clear deselects", () => {
      renderSection(SAMPLE_CHILDREN);
      selectRow("VPL-10");
      // The toolbar's select-all toggle is titled "Select all".
      fireEvent.click(screen.getByTitle("Select all"));
      expect(screen.getByText(/3\/3 selected/)).toBeInTheDocument();
      fireEvent.click(screen.getByText("Clear"));
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });

    it("bulk-moves all checked issues to a sprint in one call", async () => {
      renderSection(SAMPLE_CHILDREN);
      selectRow("VPL-10");
      selectRow("VPL-12");
      openBulkMenu("Move to Sprint");
      fireEvent.click(screen.getByText("Sprint 3"));
      await waitFor(() => {
        expect(mockMoveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-10", "VPL-12"], targetSprintId: "3" });
      });
    });

    it("bulk-flags every checked issue", async () => {
      renderSection(SAMPLE_CHILDREN);
      selectRow("VPL-10");
      selectRow("VPL-11");
      openBulkMenu("Flag");
      await waitFor(() => {
        expect(mockToggleFlag).toHaveBeenCalledTimes(2);
      });
      expect(mockToggleFlag).toHaveBeenCalledWith("VPL-10", true);
      expect(mockToggleFlag).toHaveBeenCalledWith("VPL-11", true);
    });

    it("shift-click selects a contiguous range", () => {
      renderSection(SAMPLE_CHILDREN);
      selectRow("VPL-10");
      fireEvent.click(screen.getByLabelText("Select VPL-12"), { shiftKey: true });
      // VPL-10 through VPL-12 (all three rows) get selected.
      expect(screen.getByText(/3\/3 selected/)).toBeInTheDocument();
    });

    it("supports selection in the by-sprint view", () => {
      renderSection(SAMPLE_CHILDREN);
      switchToSprintView();
      selectRow("VPL-10");
      expect(screen.getByText(/1\/3 selected/)).toBeInTheDocument();
    });
  });

  describe("list view context menu", () => {
    it("exposes the full action menu on right-click in the default list view", () => {
      renderSection(SAMPLE_CHILDREN);
      fireEvent.contextMenu(screen.getByText("First story"));
      for (const label of [
        "Set Status",
        "Set Readiness",
        "Set Epic",
        "Move to Sprint",
        "Update Assignee",
        "Add/Update Label",
        "Flag",
        "Review Story",
        "Generate Subtasks",
        "Add to Refinement",
      ]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it("flags the right-clicked row from the list view", async () => {
      renderSection(SAMPLE_CHILDREN);
      fireEvent.contextMenu(screen.getByText("First story"));
      fireEvent.click(screen.getByText("Flag"));
      await waitFor(() => {
        expect(mockToggleFlag).toHaveBeenCalledWith("VPL-10", true);
      });
      expect(mockToggleFlag).toHaveBeenCalledTimes(1);
    });
  });
});
