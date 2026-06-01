import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

describe("BulkActionBar", () => {
  const defaultProps = {
    count: 3,
    totalCount: 10,
    onClear: vi.fn(),
  };

  it("renders selection counter with count", () => {
    render(<BulkActionBar {...defaultProps} />);
    expect(screen.getByText(/3\/10 selected/)).toBeTruthy();
  });

  it("shows SP badge when selectedPoints > 0", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={5} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("SP")).toBeTruthy();
  });

  it("shows BV badge when selectedBV > 0", () => {
    render(<BulkActionBar {...defaultProps} selectedBV={7} />);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("BV")).toBeTruthy();
  });

  it("shows both SP and BV badges when both > 0", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={3} selectedBV={7} />);
    expect(screen.getByText("SP")).toBeTruthy();
    expect(screen.getByText("BV")).toBeTruthy();
  });

  it("hides SP when 0", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={0} />);
    expect(screen.queryByText("SP")).toBeNull();
  });

  it("hides BV when 0", () => {
    render(<BulkActionBar {...defaultProps} selectedBV={0} />);
    expect(screen.queryByText("BV")).toBeNull();
  });

  it("renders Copy List button when onCopyToClipboard is provided", () => {
    const onCopy = vi.fn();
    render(<BulkActionBar {...defaultProps} onCopyToClipboard={onCopy} />);
    fireEvent.click(screen.getByText("Copy List"));
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it("renders Add to Refinement button when onRefine is provided", () => {
    const onRefine = vi.fn();
    render(<BulkActionBar {...defaultProps} onRefine={onRefine} />);
    fireEvent.click(screen.getByText("Add to Refinement"));
    expect(onRefine).toHaveBeenCalledOnce();
  });

  it("renders Clear button and calls onClear", () => {
    const onClear = vi.fn();
    render(<BulkActionBar {...defaultProps} onClear={onClear} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("renders Update dropdown when update actions are provided", () => {
    render(
      <BulkActionBar
        {...defaultProps}
        onSetStatus={vi.fn()}
        onSetReadiness={vi.fn()}
      />,
    );
    expect(screen.getByText("Update")).toBeTruthy();
  });

  it("renders AI Assist dropdown when AI actions are provided", () => {
    render(
      <BulkActionBar
        {...defaultProps}
        onReviewStory={vi.fn()}
        onGenerateSubtasks={vi.fn()}
      />,
    );
    expect(screen.getByText("AI Assist")).toBeTruthy();
  });

  it("opens Update dropdown and shows menu items", () => {
    render(
      <BulkActionBar
        {...defaultProps}
        onSetStatus={vi.fn()}
        onSetReadiness={vi.fn()}
        onMoveSprint={vi.fn()}
        sprints={[{ id: "1", name: "Sprint 1", dateRange: "", state: "active", ticketCount: 5 }]}
      />,
    );
    fireEvent.click(screen.getByText("Update"));
    expect(screen.getByText("Set Status")).toBeTruthy();
    expect(screen.getByText("Set Readiness")).toBeTruthy();
    expect(screen.getByText("Move to Sprint")).toBeTruthy();
  });

  it("lists pinned sprints first, in pinned order, in the Move to Sprint sub-panel", () => {
    render(
      <BulkActionBar
        {...defaultProps}
        onMoveSprint={vi.fn()}
        sprints={[
          { id: "1", name: "Sprint A", dateRange: "", state: "future", ticketCount: 0 },
          { id: "2", name: "Sprint B", dateRange: "", state: "active", ticketCount: 0 },
          { id: "3", name: "Sprint C", dateRange: "", state: "future", ticketCount: 0 },
        ]}
        pinnedSprintIds={["3", "1"]}
      />,
    );
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Move to Sprint"));
    const c = screen.getByText("Sprint C");
    const a = screen.getByText("Sprint A");
    const b = screen.getByText("Sprint B");
    // Expected order: pinned [C, A] first, then the rest [B].
    expect(c.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("calls onMoveSprint with the selected sprint id", () => {
    const onMoveSprint = vi.fn();
    render(
      <BulkActionBar
        {...defaultProps}
        onMoveSprint={onMoveSprint}
        sprints={[{ id: "42", name: "Sprint 42", dateRange: "", state: "active", ticketCount: 5 }]}
      />,
    );
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Move to Sprint"));
    fireEvent.click(screen.getByText("Sprint 42"));
    expect(onMoveSprint).toHaveBeenCalledWith("42");
  });

  it("opens AI Assist dropdown and shows menu items", () => {
    const onReview = vi.fn();
    render(
      <BulkActionBar
        {...defaultProps}
        onReviewStory={onReview}
        onGenerateSubtasks={vi.fn()}
        onExportForStakeholders={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("AI Assist"));
    expect(screen.getByText("Review Story")).toBeTruthy();
    expect(screen.getByText("Generate Subtasks")).toBeTruthy();
    expect(screen.getByText("Summarized List")).toBeTruthy();
  });

  it("calls onReviewStory when Review Story is clicked in AI Assist dropdown", () => {
    const onReview = vi.fn();
    render(
      <BulkActionBar
        {...defaultProps}
        onReviewStory={onReview}
      />,
    );
    fireEvent.click(screen.getByText("AI Assist"));
    fireEvent.click(screen.getByText("Review Story"));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("navigates to status sub-panel and selects a status", () => {
    const onSetStatus = vi.fn();
    render(
      <BulkActionBar
        {...defaultProps}
        onSetStatus={onSetStatus}
      />,
    );
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Set Status"));
    expect(screen.getByText("TO DO")).toBeTruthy();
    expect(screen.getAllByText("DONE").length).toBeGreaterThan(0);
    // Click the status row button (contains both badge and label)
    const doneButtons = screen.getAllByText("DONE");
    // The second "DONE" is the label span inside the button
    fireEvent.click(doneButtons[1]);
    expect(onSetStatus).toHaveBeenCalledWith("DONE");
  });

  it("navigates to readiness sub-panel with back button", () => {
    const onSetReadiness = vi.fn();
    render(
      <BulkActionBar
        {...defaultProps}
        onSetReadiness={onSetReadiness}
      />,
    );
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Set Readiness"));
    expect(screen.getByText("Drafting")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Set Readiness")).toBeTruthy();
  });

  it("does not render Update dropdown when no update actions", () => {
    render(<BulkActionBar {...defaultProps} />);
    expect(screen.queryByText("Update")).toBeNull();
  });

  it("does not render AI Assist dropdown when no AI actions", () => {
    render(<BulkActionBar {...defaultProps} />);
    expect(screen.queryByText("AI Assist")).toBeNull();
  });

  it("renders Refresh from Jira button", () => {
    const onRefresh = vi.fn();
    render(<BulkActionBar {...defaultProps} onRefreshFromJira={onRefresh} />);
    fireEvent.click(screen.getByText("Refresh from Jira"));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("shows toggle-all checkbox when onToggleAll provided", () => {
    render(<BulkActionBar {...defaultProps} onToggleAll={vi.fn()} allChecked={false} />);
    expect(screen.getByTitle("Select all")).toBeTruthy();
  });

  it("shows deselect all title when allChecked", () => {
    render(<BulkActionBar {...defaultProps} onToggleAll={vi.fn()} allChecked={true} />);
    expect(screen.getByTitle("Deselect all")).toBeTruthy();
  });
});
