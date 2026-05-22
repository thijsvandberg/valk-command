import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicChildrenSection } from "./EpicChildrenSection";
import type { Subtask } from "@/types/ticket";

const mockCreateChildIssue = vi.fn();
const mockSearchForLink = vi.fn();
const mockSearchForLinkWithJira = vi.fn();
const mockUpdateEpic = vi.fn();
vi.mock("@/lib/api-client", () => ({
  tickets: {
    createChildIssue: (...args: unknown[]) => mockCreateChildIssue(...args),
    searchForLink: (...args: unknown[]) => mockSearchForLink(...args),
    searchForLinkWithJira: (...args: unknown[]) => mockSearchForLinkWithJira(...args),
    updateEpic: (...args: unknown[]) => mockUpdateEpic(...args),
  },
  ApiError: class ApiError extends Error {},
}));

const SAMPLE_CHILDREN: Subtask[] = [
  { key: "VPL-10", title: "First story", type: "story", jiraStatus: "TO DO", assignee: null },
  { key: "VPL-11", title: "Second task", type: "task", jiraStatus: "IN PROGRESS", assignee: null },
  { key: "VPL-12", title: "Done story", type: "story", jiraStatus: "DONE", assignee: null },
];

function renderSection(items: Subtask[] = []) {
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

describe("EpicChildrenSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchForLink.mockResolvedValue([]);
    mockSearchForLinkWithJira.mockResolvedValue([]);
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
      const typeButtons = screen.queryAllByRole("button");
      expect(typeButtons.length).toBeGreaterThan(0);
    });

    it("shows type picker on click and selects a type", async () => {
      renderSection();
      const typeButton = screen.getAllByRole("button")[0];
      fireEvent.click(typeButton);

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

  describe("status filters", () => {
    it("shows filter chips when items exist", () => {
      renderSection(SAMPLE_CHILDREN);
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("To Do")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    it("does not show filter chips when no items", () => {
      renderSection([]);
      expect(screen.queryByText("All")).not.toBeInTheDocument();
    });

    it("filters items when clicking a status chip", () => {
      renderSection(SAMPLE_CHILDREN);

      fireEvent.click(screen.getByText("To Do"));

      expect(screen.getByText("VPL-10")).toBeInTheDocument();
      expect(screen.queryByText("VPL-11")).not.toBeInTheDocument();
      expect(screen.queryByText("VPL-12")).not.toBeInTheDocument();
    });

    it("shows all items when clicking All", () => {
      renderSection(SAMPLE_CHILDREN);

      fireEvent.click(screen.getByText("Done"));
      expect(screen.queryByText("VPL-10")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("All"));
      expect(screen.getByText("VPL-10")).toBeInTheDocument();
      expect(screen.getByText("VPL-11")).toBeInTheDocument();
      expect(screen.getByText("VPL-12")).toBeInTheDocument();
    });

    it("hides filter chips with zero count", () => {
      const items: Subtask[] = [
        { key: "VPL-10", title: "Only todo", type: "story", jiraStatus: "TO DO", assignee: null },
      ];
      renderSection(items);
      expect(screen.getByText("To Do")).toBeInTheDocument();
      expect(screen.queryByText("In Progress")).not.toBeInTheDocument();
      expect(screen.queryByText("Done")).not.toBeInTheDocument();
    });
  });

  describe("choose existing", () => {
    it("shows Choose existing button", () => {
      renderSection();
      expect(screen.getByText("Choose existing")).toBeInTheDocument();
    });

    it("opens search input when clicking Choose existing", () => {
      renderSection();
      fireEvent.click(screen.getByText("Choose existing"));
      expect(screen.getByPlaceholderText("Search by key or title...")).toBeInTheDocument();
    });

    it("shows search results after typing", async () => {
      mockSearchForLink.mockResolvedValue([
        { key: "VPL-50", title: "Existing ticket", type: "story", status: "TO DO", source: "local" },
      ]);

      renderSection();
      fireEvent.click(screen.getByText("Choose existing"));

      const searchInput = screen.getByPlaceholderText("Search by key or title...");
      fireEvent.change(searchInput, { target: { value: "VPL-50" } });

      await waitFor(() => {
        expect(screen.getByText("Existing ticket")).toBeInTheDocument();
      });
    });

    it("links existing ticket on click", async () => {
      mockSearchForLink.mockResolvedValue([
        { key: "VPL-50", title: "Existing ticket", type: "story", status: "TO DO", source: "local" },
      ]);
      mockUpdateEpic.mockResolvedValue({ epic: "Epic VPL-1", epicKey: "VPL-1" });

      const { onMutate } = renderSection();
      fireEvent.click(screen.getByText("Choose existing"));

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
      fireEvent.click(screen.getByText("Choose existing"));
      expect(screen.getByPlaceholderText("Search by key or title...")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Cancel"));
      expect(screen.queryByPlaceholderText("Search by key or title...")).not.toBeInTheDocument();
      expect(screen.getByText("Choose existing")).toBeInTheDocument();
    });

    it("closes search on Escape", () => {
      renderSection();
      fireEvent.click(screen.getByText("Choose existing"));
      const searchInput = screen.getByPlaceholderText("Search by key or title...");

      fireEvent.keyDown(searchInput, { key: "Escape" });
      expect(screen.queryByPlaceholderText("Search by key or title...")).not.toBeInTheDocument();
    });

    it("excludes already-linked children from results", async () => {
      mockSearchForLink.mockResolvedValue([
        { key: "VPL-10", title: "First story", type: "story", status: "TO DO", source: "local" },
        { key: "VPL-50", title: "New ticket", type: "task", status: "TO DO", source: "local" },
      ]);

      renderSection(SAMPLE_CHILDREN);
      fireEvent.click(screen.getByText("Choose existing"));

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
      mockSearchForLink.mockResolvedValue([
        { key: "VPL-50", title: "Fail ticket", type: "story", status: "TO DO", source: "local" },
      ]);
      mockUpdateEpic.mockRejectedValue(new Error("API error"));

      renderSection();
      fireEvent.click(screen.getByText("Choose existing"));

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
});
