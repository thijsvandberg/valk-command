import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ConversationFilterBar from "./ConversationFilterBar";
import type { ConversationCategory } from "@/lib/conversation-category";

const allCounts: Record<ConversationCategory, number> = {
  chat: 3,
  task: 5,
  investigation: 2,
  "story-writer": 4,
  "sprint-goal": 2,
  stakeholder: 1,
  review: 1,
  "ticket-chat": 0,
};

const defaultProps = {
  categoryCounts: allCounts,
  activeFilters: new Set<ConversationCategory>(),
  onToggle: vi.fn(),
  onClearAll: vi.fn(),
};

describe("ConversationFilterBar", () => {
  it("renders All pill and category pills with counts", () => {
    render(<ConversationFilterBar {...defaultProps} />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("Sprint Goal")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // chat count
    expect(screen.getByText("5")).toBeInTheDocument(); // task count
  });

  it("hides categories with zero count", () => {
    const counts = { ...allCounts, review: 0 };
    render(<ConversationFilterBar {...defaultProps} categoryCounts={counts} />);
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("does not render when fewer than 2 categories have conversations", () => {
    const counts: Record<ConversationCategory, number> = {
      chat: 5, task: 0, investigation: 0, "story-writer": 0,
      "sprint-goal": 0, stakeholder: 0, review: 0, "ticket-chat": 0,
    };
    const { container } = render(<ConversationFilterBar {...defaultProps} categoryCounts={counts} />);
    expect(container.innerHTML).toBe("");
  });

  it("calls onToggle when a category pill is clicked", () => {
    const onToggle = vi.fn();
    render(<ConversationFilterBar {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByText("Task"));
    expect(onToggle).toHaveBeenCalledWith("task");
  });

  it("calls onClearAll when All pill is clicked", () => {
    const onClearAll = vi.fn();
    render(<ConversationFilterBar {...defaultProps} onClearAll={onClearAll} />);
    fireEvent.click(screen.getByText("All"));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("highlights active filters with category color styling", () => {
    const activeFilters = new Set<ConversationCategory>(["task"]);
    render(<ConversationFilterBar {...defaultProps} activeFilters={activeFilters} />);
    const taskPill = screen.getByTestId("filter-pill-task");
    expect(taskPill.style.backgroundColor).toBeTruthy();
  });

  it("has correct aria label on the filter group", () => {
    render(<ConversationFilterBar {...defaultProps} />);
    expect(screen.getByRole("group", { name: "Conversation type filters" })).toBeInTheDocument();
  });
});
