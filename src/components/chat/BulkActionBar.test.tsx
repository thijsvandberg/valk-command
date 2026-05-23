import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BulkActionBar from "./BulkActionBar";

function renderBar(overrides: Partial<Parameters<typeof BulkActionBar>[0]> = {}) {
  const defaults = {
    selectedCount: 3,
    totalCount: 10,
    allSelected: false,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onMarkRead: vi.fn(),
    onMarkUnread: vi.fn(),
    onDelete: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  render(<BulkActionBar {...defaults} />);
  return defaults;
}

describe("BulkActionBar", () => {
  it("displays selected count", () => {
    renderBar({ selectedCount: 5 });
    expect(screen.getByText("5 selected")).toBeInTheDocument();
  });

  it("shows 'Select all' when not all selected", () => {
    renderBar({ allSelected: false, totalCount: 10 });
    expect(screen.getByText("Select all (10)")).toBeInTheDocument();
  });

  it("shows 'Deselect all' when all selected", () => {
    renderBar({ allSelected: true });
    expect(screen.getByText("Deselect all")).toBeInTheDocument();
  });

  it("calls onSelectAll when clicking select all", () => {
    const props = renderBar({ allSelected: false });
    fireEvent.click(screen.getByText(/Select all/));
    expect(props.onSelectAll).toHaveBeenCalled();
  });

  it("calls onMarkRead", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTestId("bulk-mark-read"));
    expect(props.onMarkRead).toHaveBeenCalled();
  });

  it("calls onMarkUnread", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTestId("bulk-mark-unread"));
    expect(props.onMarkUnread).toHaveBeenCalled();
  });

  it("shows confirm dialog before delete", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTestId("bulk-delete"));
    expect(screen.getByText("Delete conversations")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete"));
    expect(props.onDelete).toHaveBeenCalled();
  });

  it("calls onExit", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTestId("bulk-exit"));
    expect(props.onExit).toHaveBeenCalled();
  });
});
