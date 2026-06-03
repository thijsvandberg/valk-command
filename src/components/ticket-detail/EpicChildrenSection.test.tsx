import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicChildrenSection } from "./EpicChildrenSection";
import type { EpicChild } from "@/types/ticket";

const mockCreateChildIssue = vi.fn();
const mockSearchForLink = vi.fn();
const mockSearchForLinkWithJira = vi.fn();
const mockUpdateEpic = vi.fn();
const mockGetSectionVisibility = vi.fn();
vi.mock("@/lib/api-client", () => ({
  // ChildIssueRow → useTicketHoverData → useTickets/useJiraSprints read swrFetcher.
  // The by-sprint view reads sprint metadata (state/dates) from /api/jira/sprints.
  swrFetcher: vi.fn(async (url: string) => {
    if (typeof url === "string" && url.startsWith("/api/jira/sprints")) {
      return {
        sprints: [
          { id: 1, name: "Sprint 1", state: "active", startDate: "2026-06-01", endDate: "2026-06-14", goal: null },
          { id: 2, name: "Sprint 2", state: "closed", startDate: "2026-05-01", endDate: "2026-05-14", goal: null },
        ],
        backlogCount: 0,
      };
    }
    return [];
  }),
  tickets: {
    createChildIssue: (...args: unknown[]) => mockCreateChildIssue(...args),
    searchForLink: (...args: unknown[]) => mockSearchForLink(...args),
    searchForLinkWithJira: (...args: unknown[]) => mockSearchForLinkWithJira(...args),
    updateEpic: (...args: unknown[]) => mockUpdateEpic(...args),
  },
  settings: {
    getSectionVisibility: (...args: unknown[]) => mockGetSectionVisibility(...args),
    saveSectionVisibility: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {},
}));

const SAMPLE_CHILDREN: EpicChild[] = [
  { key: "VPL-10", title: "First story", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: 3, sprintName: "Sprint 1", subtaskCount: 2, readiness: null },
  { key: "VPL-11", title: "Second task", type: "task", jiraStatus: "IN PROGRESS", assignee: null, storyPoints: null, sprintName: null, subtaskCount: 0, readiness: "drafting" },
  { key: "VPL-12", title: "Done story", type: "story", jiraStatus: "DONE", assignee: null, storyPoints: 5, sprintName: "Sprint 1", subtaskCount: 1, readiness: null },
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

    it("shows subtask count", () => {
      renderSection(SAMPLE_CHILDREN);
      const badges = screen.getAllByText("2");
      expect(badges.length).toBeGreaterThanOrEqual(1);
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
      expect(onSelectTicket).toHaveBeenCalledWith("VPL-10");
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
        { key: "VPL-20", title: "Active item", type: "story", jiraStatus: "TO DO", assignee: null, storyPoints: 1, sprintName: "Sprint 1", subtaskCount: 0, readiness: null },
        { key: "VPL-21", title: "Closed item", type: "story", jiraStatus: "DONE", assignee: null, storyPoints: 2, sprintName: "Sprint 2", subtaskCount: 0, readiness: null },
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
  });
});
