import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

describe("BulkActionBar", () => {
  const defaultProps = {
    count: 3,
    totalCount: 10,
    onClear: vi.fn(),
  };

  // Group icons are icon-only (BRDG-374): the label is the button's accessible name.
  const openGroup = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

  it("renders selection counter with count", () => {
    render(<BulkActionBar {...defaultProps} />);
    expect(screen.getByText(/3\/10 selected/)).toBeTruthy();
  });

  it("shows SP badge when selectedPoints > 0", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={5} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByLabelText("Story Points: 5")).toBeTruthy();
  });

  it("shows BV badge when selectedBV > 0", () => {
    render(<BulkActionBar {...defaultProps} selectedBV={7} />);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByLabelText("Business Value: 7")).toBeTruthy();
  });

  it("shows both SP and BV badges when both > 0", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={3} selectedBV={7} />);
    expect(screen.getByLabelText("Story Points: 3")).toBeTruthy();
    expect(screen.getByLabelText("Business Value: 7")).toBeTruthy();
  });

  // BRDG-454: a second SP total that folds in guestimates for unestimated tickets.
  it("shows both SP totals when the SP+guestimate total exceeds SP-only", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={5} selectedEffectivePoints={8} />);
    const spTotals = screen.getAllByLabelText(/Story Points/);
    expect(spTotals.length).toBe(2);
    expect(screen.getByLabelText("Story Points: 5")).toBeTruthy();
    expect(screen.getByLabelText("Story Points: 8")).toBeTruthy();
  });

  it("renders the SP+guestimate total as a penciled (dashed) badge", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={5} selectedEffectivePoints={8} />);
    const combined = screen.getByLabelText("Story Points: 8").closest("span")!;
    expect(combined.className).toContain("border-dashed");
  });

  it("shows only the SP-only total when SP+guestimate equals it (no guestimate-only tickets)", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={5} selectedEffectivePoints={5} />);
    expect(screen.getAllByLabelText(/Story Points/).length).toBe(1);
    expect(screen.getByLabelText("Story Points: 5")).toBeTruthy();
  });

  it("does not render the SP+guestimate total when selectedEffectivePoints is omitted", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={5} />);
    expect(screen.getAllByLabelText(/Story Points/).length).toBe(1);
  });

  it("hides SP when 0 (optional counters, e.g. inbox)", () => {
    render(<BulkActionBar {...defaultProps} selectedPoints={0} />);
    expect(screen.queryByLabelText(/Story Points/)).toBeNull();
  });

  it("hides BV when 0 (optional counters, e.g. inbox)", () => {
    render(<BulkActionBar {...defaultProps} selectedBV={0} />);
    expect(screen.queryByLabelText(/Business Value/)).toBeNull();
  });

  it("renders the Copy icon when onCopyToClipboard is provided", () => {
    const onCopy = vi.fn();
    render(<BulkActionBar {...defaultProps} onCopyToClipboard={onCopy} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy list" }));
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it("renders the Refinement icon when onRefine is provided", () => {
    const onRefine = vi.fn();
    render(<BulkActionBar {...defaultProps} onRefine={onRefine} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to refinement" }));
    expect(onRefine).toHaveBeenCalledOnce();
  });

  it("renders Clear button and calls onClear", () => {
    const onClear = vi.fn();
    render(<BulkActionBar {...defaultProps} onClear={onClear} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("renders the Update icon group when update actions are provided", () => {
    render(<BulkActionBar {...defaultProps} onSetStatus={vi.fn()} onSetReadiness={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
  });

  it("renders the Assist icon group when AI actions are provided", () => {
    render(<BulkActionBar {...defaultProps} onReviewStory={vi.fn()} onGenerateSubtasks={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Assist" })).toBeTruthy();
  });

  it("opens the Update dropdown and shows the set items (Move lives in its own group)", () => {
    render(
      <BulkActionBar
        {...defaultProps}
        onSetStatus={vi.fn()}
        onSetReadiness={vi.fn()}
        onMoveSprint={vi.fn()}
        sprints={[{ id: "1", name: "Sprint 1", dateRange: "", state: "active", ticketCount: 5 }]}
      />,
    );
    openGroup("Update");
    expect(screen.getByText("Set Status")).toBeTruthy();
    expect(screen.getByText("Set Readiness")).toBeTruthy();
    // Move is now a separate icon group, not inside Update.
    expect(screen.queryByText("Move to other sprint…")).toBeNull();
    expect(screen.getByRole("button", { name: "Move" })).toBeTruthy();
  });

  // Flag lives under the Update dropdown now, not as its own bar icon.
  it("shows Flag under the Update dropdown and fires onSetFlagged(true)", () => {
    const onSetFlagged = vi.fn();
    render(<BulkActionBar {...defaultProps} onSetStatus={vi.fn()} onSetFlagged={onSetFlagged} flagState="unflagged" />);
    openGroup("Update");
    fireEvent.click(screen.getByText("Flag"));
    expect(onSetFlagged).toHaveBeenCalledWith(true);
  });

  it("shows Remove flag under the Update dropdown when targets are already flagged", () => {
    render(<BulkActionBar {...defaultProps} onSetStatus={vi.fn()} onSetFlagged={vi.fn()} flagState="flagged" />);
    openGroup("Update");
    expect(screen.getByText("Remove flag")).toBeTruthy();
    expect(screen.queryByText("Flag")).toBeNull();
  });

  it("renders the Update dropdown for flag-only actions (no other update fields)", () => {
    render(<BulkActionBar {...defaultProps} onSetFlagged={vi.fn()} flagState="unflagged" />);
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
  });

  it("lists pinned sprints first, in pinned order, under the other-sprint picker", () => {
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
    openGroup("Move");
    fireEvent.click(screen.getByText("Move to other sprint…"));
    const c = screen.getByText("Sprint C");
    const a = screen.getByText("Sprint A");
    const b = screen.getByText("Sprint B");
    // Expected order: pinned [C, A] first, then the rest [B].
    expect(c.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("filters the other-sprint list via the search box", () => {
    render(
      <BulkActionBar
        {...defaultProps}
        onMoveSprint={vi.fn()}
        sprints={[
          { id: "1", name: "Sprint Alpha", dateRange: "", state: "future", ticketCount: 0 },
          { id: "2", name: "Sprint Beta", dateRange: "", state: "future", ticketCount: 0 },
        ]}
      />,
    );
    openGroup("Move");
    fireEvent.click(screen.getByText("Move to other sprint…"));
    fireEvent.change(screen.getByPlaceholderText("Search sprints..."), { target: { value: "beta" } });
    expect(screen.queryByText("Sprint Alpha")).toBeNull();
    expect(screen.getByText("Sprint Beta")).toBeTruthy();
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
    openGroup("Move");
    fireEvent.click(screen.getByText("Move to other sprint…"));
    fireEvent.click(screen.getByText("Sprint 42"));
    // No explicit position on a plain row click (BRDG-362 top/bottom buttons set one).
    expect(onMoveSprint).toHaveBeenCalledWith("42", undefined);
  });

  it("opens the Assist dropdown and shows menu items", () => {
    render(
      <BulkActionBar
        {...defaultProps}
        onReviewStory={vi.fn()}
        onGenerateSubtasks={vi.fn()}
        onExportForStakeholders={vi.fn()}
      />,
    );
    openGroup("Assist");
    expect(screen.getByText("Review Story")).toBeTruthy();
    expect(screen.getByText("Generate Subtasks")).toBeTruthy();
    expect(screen.getByText("Summarized List")).toBeTruthy();
  });

  it("shows a spinner on the collapsed Assist trigger while exporting", () => {
    const { container } = render(<BulkActionBar {...defaultProps} onExportForStakeholders={vi.fn()} isExporting />);
    // Menu is closed, but the trigger button itself should spin.
    expect(screen.queryByText("Summarized List")).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows a spinner on the collapsed Assist trigger while generating subtasks", () => {
    const { container } = render(<BulkActionBar {...defaultProps} onGenerateSubtasks={vi.fn()} isGeneratingSubtasks />);
    expect(screen.queryByText("Generating...")).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("calls onReviewStory when Review Story is clicked in the Assist dropdown", () => {
    const onReview = vi.fn();
    render(<BulkActionBar {...defaultProps} onReviewStory={onReview} />);
    openGroup("Assist");
    fireEvent.click(screen.getByText("Review Story"));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("navigates Update -> status sub-panel and selects a status", () => {
    const onSetStatus = vi.fn();
    render(<BulkActionBar {...defaultProps} onSetStatus={onSetStatus} />);
    openGroup("Update");
    fireEvent.click(screen.getByText("Set Status"));
    expect(screen.getByText("TO DO")).toBeTruthy();
    expect(screen.getAllByText("DONE").length).toBeGreaterThan(0);
    // Click the status row button (contains both badge and label)
    const doneButtons = screen.getAllByText("DONE");
    // The second "DONE" is the label span inside the button
    fireEvent.click(doneButtons[1]);
    expect(onSetStatus).toHaveBeenCalledWith("DONE");
  });

  it("reveals Update's Set Readiness options in a hover flyout (no Back)", () => {
    const onSetReadiness = vi.fn();
    render(<BulkActionBar {...defaultProps} onSetReadiness={onSetReadiness} />);
    openGroup("Update");
    // The Set Readiness flyout + its options render in the DOM (shown on hover); no Back.
    expect(screen.getByText("Set Readiness")).toBeTruthy();
    expect(screen.getByText("Drafting")).toBeTruthy();
    expect(screen.queryByText("Back")).toBeNull();
  });

  it("does not render the Update group when no update actions", () => {
    render(<BulkActionBar {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
  });

  it("does not render the Assist group when no AI actions", () => {
    render(<BulkActionBar {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "Assist" })).toBeNull();
  });

  it("renders the Refresh icon", () => {
    const onRefresh = vi.fn();
    render(<BulkActionBar {...defaultProps} onRefreshFromJira={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Jira" }));
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

  // BRDG-373: the inbox-only "Mark as read" primary action.
  it("renders the Mark as read button and calls onMarkRead when provided", () => {
    const onMarkRead = vi.fn();
    render(<BulkActionBar {...defaultProps} onMarkRead={onMarkRead} markReadCount={3} />);
    const btn = screen.getByRole("button", { name: /Mark 3 as read/ });
    fireEvent.click(btn);
    expect(onMarkRead).toHaveBeenCalledOnce();
  });

  it("does not render the Mark as read button by default (board / epic bar unchanged)", () => {
    render(<BulkActionBar {...defaultProps} onSetStatus={vi.fn()} />);
    expect(screen.queryByText(/Mark .* as read/)).toBeNull();
  });
});
